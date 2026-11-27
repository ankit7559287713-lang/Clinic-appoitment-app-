import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';

function validateRecord(input) {
  const errors = {};
  const textFields = ['chiefComplaint', 'diagnosis', 'symptoms', 'treatmentPlan', 'notes', 'referralDoctor', 'referralReason', 'referralInstructions'];
  for (const field of textFields) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > (field === 'notes' ? 5000 : 1000)) {
      errors[field] = `${field} is too long.`;
    }
  }
  if (!Array.isArray(input.prescriptions) || input.prescriptions.length > 20) {
    errors.prescriptions = 'Add no more than 20 medicines.';
  }
  const names = new Set();
  (Array.isArray(input.prescriptions) ? input.prescriptions : []).forEach((medicine, index) => {
    const prefix = `prescription-${index}`;
    if (!String(medicine.medicineName || '').trim()) errors[`${prefix}-name`] = 'Enter a medicine name.';
    if (!String(medicine.dosage || '').trim()) errors[`${prefix}-dosage`] = 'Enter a dosage.';
    if (!String(medicine.frequency || '').trim()) errors[`${prefix}-frequency`] = 'Enter a frequency.';
    if (!String(medicine.duration || '').trim()) errors[`${prefix}-duration`] = 'Enter a duration.';
    if (!String(medicine.instructions || '').trim()) errors[`${prefix}-instructions`] = 'Enter medicine instructions.';
    const key = String(medicine.medicineName || '').trim().toLowerCase();
    if (key && names.has(key)) errors[`${prefix}-name`] = 'Each medicine can only appear once per prescription.';
    if (key) names.add(key);
    for (const field of ['medicineName', 'dosage', 'frequency', 'duration', 'instructions']) {
      if (String(medicine[field] || '').length > 240) errors[`${prefix}-${field}`] = 'Each medicine field must be 240 characters or fewer.';
    }
  });
  if (input.referralRequired && !String(input.referralDoctor || '').trim()) {
    errors.referralDoctor = 'Enter the referred doctor or specialist.';
  }
  if (input.referralRequired && !String(input.referralReason || '').trim()) {
    errors.referralReason = 'Enter the referral reason.';
  }
  return errors;
}

function resolveEncounter(data, { appointmentId, encounterId, actor }) {
  if (appointmentId) {
    const appointment = data.appointments.find((entry) => entry.appointmentId === appointmentId);
    if (!appointment) return fail('APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    if (!can(actor, 'consultationWrite', { doctorId: appointment.doctorId })) {
      return fail('UNAUTHORIZED', 'Only this appointment’s doctor can edit its clinical record.');
    }
    if (appointment.status === 'Cancelled') return fail('INVALID_STATUS', 'Cancelled appointments cannot have a clinical record.');
    return ok({
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      appointmentId,
      encounterId: appointmentId,
      encounterType: 'Appointment',
      source: appointment,
    });
  }

  const queueEntry = (data.queueEntries || []).find((entry) => entry.queueId === encounterId);
  if (queueEntry) {
    if (!can(actor, 'consultationWrite', { doctorId: queueEntry.doctorId })) {
      return fail('UNAUTHORIZED', 'Only the assigned doctor can edit this walk-in record.');
    }
    if (!['WalkIn', 'EmergencyWalkIn'].includes(queueEntry.entryType)) {
      return fail('INVALID_ENTRY_TYPE', 'This queue entry is not a walk-in encounter.');
    }
    if (queueEntry.status === 'Cancelled') {
      return fail('INVALID_STATUS', 'Cancelled walk-ins cannot have a clinical record.');
    }
    return ok({
      patientId: queueEntry.patientId,
      doctorId: queueEntry.doctorId,
      appointmentId: null,
      encounterId,
      encounterType: queueEntry.entryType,
      source: queueEntry,
    });
  }

  const emergency = (data.emergencyRequests || []).find((entry) => entry.requestId === encounterId);
  if (emergency) {
    if (!can(actor, 'emergencyManage', { emergency })) {
      return fail('UNAUTHORIZED', 'Only the assigned doctor can edit this emergency record.');
    }
    if (!['Approved', 'In Progress', 'Completed'].includes(emergency.status)) {
      return fail('INVALID_STATUS', 'Only an approved emergency case can have a clinical record.');
    }
    return ok({
      patientId: emergency.patientId,
      doctorId: emergency.doctorId,
      appointmentId: null,
      encounterId,
      encounterType: 'Emergency',
      source: emergency,
    });
  }
  return fail('ENCOUNTER_NOT_FOUND', 'Patient encounter not found.');
}

export function saveClinicalRecord({
  appointmentId = null,
  encounterId = null,
  chiefComplaint = '',
  diagnosis = '',
  symptoms = '',
  treatmentPlan = '',
  notes = '',
  prescriptions = [],
  referralRequired = false,
  referralDoctor = '',
  referralReason = '',
  referralInstructions = '',
  amendsConsultationId = null,
  actor,
}, now = new Date()) {
  const errors = validateRecord({
    chiefComplaint, diagnosis, symptoms, treatmentPlan, notes, prescriptions,
    referralRequired, referralDoctor, referralReason, referralInstructions,
  });
  if (Object.keys(errors).length) return fail('INVALID_INPUT', 'Please correct the clinical record fields.', { errors });
  return transact((data) => {
    const target = resolveEncounter(data, { appointmentId, encounterId, actor });
    if (!target.ok) return target;
    const previous = (data.consultations || []).filter((entry) =>
      entry.patientId === target.patientId &&
      entry.doctorId === target.doctorId &&
      entry.encounterId === target.encounterId
    );
    if (!amendsConsultationId && previous.length) {
      return fail('RECORD_EXISTS', 'This encounter already has a consultation. Create a clearly marked amendment instead.');
    }
    if (amendsConsultationId && !previous.some((entry) => entry.consultationId === amendsConsultationId)) {
      return fail('INVALID_AMENDMENT', 'The consultation being amended does not belong to this encounter.');
    }

    data.consultations ||= [];
    data.prescriptions ||= [];
    const consultation = {
      consultationId: newId('c'),
      appointmentId: target.appointmentId,
      encounterId: target.encounterId,
      encounterType: target.encounterType,
      patientId: target.patientId,
      doctorId: target.doctorId,
      chiefComplaint: chiefComplaint.trim(),
      diagnosis: diagnosis.trim(),
      symptoms: symptoms.trim(),
      treatmentPlan: treatmentPlan.trim(),
      notes: notes.trim(),
      referralRequired: Boolean(referralRequired),
      referralDoctor: referralDoctor.trim(),
      referralReason: referralReason.trim(),
      referralInstructions: referralInstructions.trim(),
      recordType: amendsConsultationId ? 'Amendment' : 'Consultation',
      amendsConsultationId,
      createdAt: now.toISOString(),
      updatedAt: null,
    };
    data.consultations.push(consultation);
    const savedPrescriptions = prescriptions.map((medicine) => ({
      prescriptionId: newId('rx'),
      consultationId: consultation.consultationId,
      appointmentId: target.appointmentId,
      encounterId: target.encounterId,
      patientId: target.patientId,
      doctorId: target.doctorId,
      medicineName: String(medicine.medicineName).trim(),
      dosage: String(medicine.dosage).trim(),
      frequency: String(medicine.frequency).trim(),
      duration: String(medicine.duration).trim(),
      instructions: String(medicine.instructions).trim(),
      createdAt: now.toISOString(),
      updatedAt: null,
    }));
    data.prescriptions.push(...savedPrescriptions);
    if (target.encounterType === 'Emergency' && target.source.status === 'Approved') {
      target.source.status = 'In Progress';
      target.source.statusHistory ||= [];
      target.source.statusHistory.push({ status: 'In Progress', at: now.toISOString(), actorRole: actor.role, actorId: actor.doctorId });
    } else if (['WalkIn', 'EmergencyWalkIn'].includes(target.encounterType) && target.source.status === 'Waiting') {
      target.source.status = 'Consulting';
      target.source.updatedAt = now.toISOString();
      target.source.statusHistory ||= [];
      target.source.statusHistory.push({ status: 'Consulting', at: now.toISOString(), actorRole: actor.role, actorId: actor.doctorId });
    }
    return ok({ consultation, prescriptions: savedPrescriptions });
  });
}

function consultationIsVisible(data, consultation, actor) {
  if (!can(actor, 'clinicalRead', { patientId: consultation.patientId, doctorId: consultation.doctorId })) return false;
  if (actor.role === 'patient') {
    const appointment = consultation.appointmentId && data.appointments.find((entry) => entry.appointmentId === consultation.appointmentId);
    const queueEntry = consultation.encounterId && (data.queueEntries || []).find((entry) => entry.queueId === consultation.encounterId);
    const emergency = consultation.encounterType === 'Emergency' &&
      (data.emergencyRequests || []).find((entry) => entry.requestId === consultation.encounterId);
    return appointment?.status === 'Completed' || queueEntry?.status === 'Completed' || emergency?.status === 'Completed';
  }
  if (actor.role === 'doctor') {
    const appointment = consultation.appointmentId && data.appointments.find((entry) => entry.appointmentId === consultation.appointmentId);
    const queueEntry = consultation.encounterId && (data.queueEntries || []).find((entry) => entry.queueId === consultation.encounterId);
    const emergency = consultation.encounterType === 'Emergency' &&
      (data.emergencyRequests || []).find((entry) => entry.requestId === consultation.encounterId);
    return appointment?.doctorId === actor.doctorId ||
      queueEntry?.doctorId === actor.doctorId ||
      emergency?.doctorId === actor.doctorId;
  }
  return actor.role === 'receptionist';
}

export function patientClinicalRecords(data, patientId, actor) {
  if (!can(actor, 'clinicalRead', { patientId, doctorId: actor?.doctorId })) {
    return fail('UNAUTHORIZED', 'You can only view records allowed for your role and patient.');
  }
  const records = (data.consultations || [])
    .filter((consultation) => consultation.patientId === patientId && consultationIsVisible(data, consultation, actor))
    .map((consultation) => ({
      appointment: consultation.appointmentId
        ? data.appointments.find((entry) => entry.appointmentId === consultation.appointmentId) || null
        : null,
      encounter: consultation.encounterType === 'Emergency'
        ? (data.emergencyRequests || []).find((entry) => entry.requestId === consultation.encounterId) || null
        : (data.queueEntries || []).find((entry) => entry.queueId === consultation.encounterId) || null,
      consultation,
      prescriptions: (data.prescriptions || []).filter((entry) =>
        entry.patientId === patientId &&
        entry.doctorId === consultation.doctorId &&
        (entry.consultationId === consultation.consultationId ||
          (!entry.consultationId && consultation.appointmentId && entry.appointmentId === consultation.appointmentId)),
      ),
      doctor: data.doctors.find((entry) => entry.doctorId === consultation.doctorId) || null,
    }))
    .sort((a, b) => b.consultation.createdAt.localeCompare(a.consultation.createdAt));
  return ok({ records });
}

export function patientChart(data, patientId, actor) {
  const patient = data.patients.find((entry) => entry.patientId === patientId);
  if (!patient) return fail('PATIENT_NOT_FOUND', 'Patient not found.');
  if (!can(actor, 'clinicalRead', { patientId, doctorId: actor?.doctorId })) {
    return fail('UNAUTHORIZED', 'You cannot view this patient chart.');
  }
  if (actor.role === 'doctor') {
    const assigned = data.appointments.some((entry) => entry.patientId === patientId && entry.doctorId === actor.doctorId) ||
      (data.queueEntries || []).some((entry) => entry.patientId === patientId && entry.doctorId === actor.doctorId) ||
      (data.emergencyRequests || []).some((entry) =>
        entry.patientId === patientId && entry.doctorId === actor.doctorId &&
        ['Approved', 'In Progress', 'Completed'].includes(entry.status),
      );
    if (!assigned) return fail('UNAUTHORIZED', 'This patient is not assigned to your clinic workflow.');
  }
  const appointments = data.appointments.filter((entry) =>
    entry.patientId === patientId && (actor.role !== 'doctor' || entry.doctorId === actor.doctorId),
  );
  const queueEntries = (data.queueEntries || []).filter((entry) =>
    entry.patientId === patientId && (actor.role !== 'doctor' || entry.doctorId === actor.doctorId),
  );
  const emergencyRequests = (data.emergencyRequests || []).filter((entry) =>
    entry.patientId === patientId && (actor.role !== 'doctor' ||
      (entry.doctorId === actor.doctorId && ['Approved', 'In Progress', 'Completed'].includes(entry.status))),
  );
  const consultations = patientClinicalRecords(data, patientId, actor);
  return ok({
    patient,
    appointments,
    queueEntries,
    emergencyRequests,
    records: consultations.ok ? consultations.records : [],
  });
}
