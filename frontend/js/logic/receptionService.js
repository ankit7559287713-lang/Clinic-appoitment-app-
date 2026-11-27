import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';
import { validatePatient, hasErrors } from './validators.js';
import { toDateTime, toISODate } from './dateUtils.js';
import { findPatientDuplicate, normalizeEmail, normalizePhone } from './patientService.js';
import { isEmergencyBufferAvailable } from './slotService.js';

const digitsOf = (value = '') => String(value).replace(/\D/g, '');
const QUEUE_STATUSES = new Set(['Waiting', 'Consulting', 'Completed', 'Cancelled']);

export function searchPatients(data, query = '') {
  const q = String(query).trim().toLowerCase();
  const digits = digitsOf(q);
  return data.patients.filter((patient) =>
    !q || patient.name.toLowerCase().includes(q) || patient.patientId.toLowerCase().includes(q) ||
    (patient.email || '').toLowerCase().includes(q) ||
    (digits && digitsOf(patient.phone).includes(digits)),
  );
}

export function patientDetails(data, patientId, actor) {
  if (!can(actor, 'registerPatient')) return fail('UNAUTHORIZED', 'Only receptionists can view patient details.');
  const patient = data.patients.find((entry) => entry.patientId === patientId);
  if (!patient) return fail('PATIENT_NOT_FOUND', 'Patient not found.');
  return ok({
    patient,
    appointments: data.appointments.filter((appointment) => appointment.patientId === patientId),
    queueEntries: (data.queueEntries || []).filter((entry) => entry.patientId === patientId),
    emergencyRequests: (data.emergencyRequests || []).filter((entry) => entry.patientId === patientId),
    consultations: (data.consultations || []).filter((entry) => entry.patientId === patientId),
    prescriptions: (data.prescriptions || []).filter((entry) => entry.patientId === patientId),
  });
}

function makeQueueEntry({ patientId, doctorId = null, appointmentId = null, referralDoctorId = null, referralReason = '', now, entryType, queueNumber = null }) {
  return {
    queueId: newId('q'),
    patientId,
    doctorId,
    appointmentId,
    entryType,
    status: 'Waiting',
    queueNumber,
    createdAt: now.toISOString(),
    checkedInAt: appointmentId ? now.toISOString() : null,
    referralDoctorId,
    referralReason: String(referralReason).trim(),
    statusHistory: [{ status: 'Waiting', at: now.toISOString(), actorRole: 'receptionist' }],
  };
}

function nextQueueNumber(data, now) {
  const date = toISODate(now);
  return (data.queueEntries || []).filter((entry) =>
    toISODate(new Date(entry.createdAt)) === date && entry.entryType !== 'ScheduledCheckIn',
  ).length + 1;
}

export function addWalkInToQueue({ patientId, doctorId = null, referralDoctorId = null, referralReason = '', actor }, now = new Date()) {
  if (!can(actor, 'registerPatient')) return fail('UNAUTHORIZED', 'Only receptionists can register walk-ins.');
  return transact((data) => {
    const patient = data.patients.find((entry) => entry.patientId === patientId);
    if (!patient) return fail('PATIENT_NOT_FOUND', 'Select a registered patient.');
    if (doctorId && !data.doctors.some((doctor) => doctor.doctorId === doctorId && doctor.status === 'active')) {
      return fail('DOCTOR_UNAVAILABLE', 'Select an active doctor.');
    }
    data.queueEntries ||= [];
    const existing = data.queueEntries.find((entry) =>
      entry.patientId === patientId && entry.entryType === 'WalkIn' &&
      entry.status !== 'Cancelled' &&
      toISODate(new Date(entry.createdAt)) === toISODate(now),
    );
    if (existing) return fail('ALREADY_IN_QUEUE', 'This patient is already in today’s walk-in queue.', { queueEntry: existing });
    const queueEntry = makeQueueEntry({ patientId, doctorId, referralDoctorId, referralReason, now, entryType: 'WalkIn', queueNumber: nextQueueNumber(data, now) });
    data.queueEntries.push(queueEntry);
    return ok({ patient, queueEntry });
  });
}

export function assignEmergencyWalkIn({ patientId, doctorId, slotId, actor }, now = new Date()) {
  if (!can(actor, 'emergencyDecision')) return fail('UNAUTHORIZED', 'Only receptionists can verify emergency walk-ins.');
  return transact((data) => {
    const patient = data.patients.find((entry) => entry.patientId === patientId);
    if (!patient) return fail('PATIENT_NOT_FOUND', 'Select a registered patient.');
    const doctor = data.doctors.find((entry) => entry.doctorId === doctorId && entry.status === 'active');
    if (!doctor) return fail('DOCTOR_UNAVAILABLE', 'Choose an active doctor.');
    const slot = data.slots.find((entry) => entry.slotId === slotId && entry.doctorId === doctorId);
    if (!slot || !isEmergencyBufferAvailable(data, slot) ||
        toDateTime(slot.date, slot.emergencyBufferStartTime || slot.consultationEndTime) <= now) {
      return fail('BUFFER_UNAVAILABLE', 'Choose a future, available emergency buffer for this doctor.');
    }
    data.queueEntries ||= [];
    const duplicate = data.queueEntries.find((entry) =>
      entry.patientId === patientId && entry.entryType !== 'ScheduledCheckIn' &&
      entry.status !== 'Cancelled' && toISODate(new Date(entry.createdAt)) === toISODate(now),
    );
    if (duplicate) return fail('ALREADY_IN_QUEUE', 'This patient already has an active queue entry today.', { queueEntry: duplicate });
    const queueEntry = makeQueueEntry({
      patientId, doctorId, now, entryType: 'EmergencyWalkIn',
      queueNumber: nextQueueNumber(data, now),
    });
    queueEntry.emergencySlotId = slotId;
    queueEntry.emergencyVerifiedAt = now.toISOString();
    queueEntry.verifiedById = actor.receptionistId;
    data.queueEntries.push(queueEntry);
    data.emergencyReservations ||= [];
    data.emergencyReservations.push({
      reservationId: newId('er'),
      queueId: queueEntry.queueId,
      patientId,
      doctorId,
      slotId,
      status: 'Reserved',
      createdAt: now.toISOString(),
      receptionistId: actor.receptionistId,
    });
    return ok({ patient, doctor, slot, queueEntry });
  });
}

export function registerWalkIn({ name, phone, email = '', doctorId = null, referralDoctorId = null, referralReason = '', actor }, now = new Date()) {
  if (!can(actor, 'registerPatient')) return fail('UNAUTHORIZED', 'Only receptionists can register walk-ins.');
  const errors = validatePatient({ name, phone, email });
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please correct the patient details.', { errors });
  return transact((data) => {
    const duplicate = findPatientDuplicate(data, { phone, email });
    if (duplicate) return fail('PATIENT_EXISTS', 'A patient with that mobile number or email already exists. Search and select the existing patient.', { patient: duplicate });
    if (doctorId && !data.doctors.some((doctor) => doctor.doctorId === doctorId && doctor.status === 'active')) {
      return fail('DOCTOR_UNAVAILABLE', 'Select an active doctor.');
    }
    const patient = {
      patientId: newId('p'),
      name: name.trim(),
      phone: normalizePhone(phone),
      email: normalizeEmail(email),
      age: null,
      gender: '',
      address: '',
    };
    data.patients.push(patient);
    data.queueEntries ||= [];
    const queueEntry = makeQueueEntry({ patientId: patient.patientId, doctorId, referralDoctorId, referralReason, now, entryType: 'WalkIn', queueNumber: nextQueueNumber(data, now) });
    data.queueEntries.push(queueEntry);
    return ok({ patient, queueEntry });
  });
}

export function updateQueueStatus({ queueId, status, actor }, now = new Date()) {
  if (!can(actor, 'queueUpdate')) return fail('UNAUTHORIZED', 'Only receptionists can update queue status.');
  if (!QUEUE_STATUSES.has(status)) return fail('INVALID_STATUS', 'Choose a supported queue status.');
  return transact((data) => {
    const queueEntry = (data.queueEntries || []).find((entry) => entry.queueId === queueId);
    if (!queueEntry) return fail('QUEUE_ENTRY_NOT_FOUND', 'Queue entry not found.');
    if (queueEntry.status === 'Completed' || queueEntry.status === 'Cancelled') {
      return fail('INVALID_STATUS', 'Completed or cancelled queue entries cannot be reopened.');
    }
    if (status === 'Completed' && queueEntry.appointmentId) {
      const appointment = data.appointments.find((entry) => entry.appointmentId === queueEntry.appointmentId);
      if (appointment?.status !== 'Completed') return fail('INVALID_STATUS', 'The assigned doctor must complete this scheduled appointment first.');
    }
    queueEntry.status = status;
    queueEntry.updatedAt = now.toISOString();
    queueEntry.statusHistory ||= [];
    queueEntry.statusHistory.push({ status, at: now.toISOString(), actorRole: actor.role, actorId: actor.receptionistId });
    return ok({ queueEntry });
  });
}

export function updateDoctorQueueStatus({ queueId, status, actor }, now = new Date()) {
  if (!['Consulting', 'Completed'].includes(status)) return fail('INVALID_STATUS', 'Doctors can start or complete an assigned walk-in encounter.');
  return transact((data) => {
    const queueEntry = (data.queueEntries || []).find((entry) => entry.queueId === queueId);
    if (!queueEntry) return fail('QUEUE_ENTRY_NOT_FOUND', 'Queue entry not found.');
    if (!can(actor, 'doctorQueueUpdate', { queueEntry })) return fail('UNAUTHORIZED', 'Doctors can only manage their assigned walk-in encounters.');
    if (!['WalkIn', 'EmergencyWalkIn'].includes(queueEntry.entryType)) {
      return fail('INVALID_ENTRY_TYPE', 'Scheduled check-ins are managed through the appointment workflow.');
    }
    if (queueEntry.status === 'Completed' || queueEntry.status === 'Cancelled') {
      return fail('INVALID_STATUS', 'Completed or cancelled queue entries cannot be reopened.');
    }
    if (status === 'Completed' && !(data.consultations || []).some((record) => record.encounterId === queueId && record.patientId === queueEntry.patientId)) {
      return fail('CLINICAL_RECORD_REQUIRED', 'Save the consultation record before completing this walk-in.');
    }
    queueEntry.status = status;
    queueEntry.updatedAt = now.toISOString();
    queueEntry.statusHistory ||= [];
    queueEntry.statusHistory.push({ status, at: now.toISOString(), actorRole: actor.role, actorId: actor.doctorId });
    return ok({ queueEntry });
  });
}

export function doctorQueueEntries(data, doctorId) {
  return (data.queueEntries || [])
    .filter((entry) => entry.doctorId === doctorId &&
      ['WalkIn', 'EmergencyWalkIn'].includes(entry.entryType) &&
      ['Waiting', 'Consulting'].includes(entry.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function referQueueEntry({ queueId, doctorId, reason, actor }, now = new Date()) {
  if (!can(actor, 'queueUpdate')) return fail('UNAUTHORIZED', 'Only receptionists can refer patients.');
  return transact((data) => {
    const entry = (data.queueEntries || []).find((queueEntry) => queueEntry.queueId === queueId);
    if (!entry) return fail('QUEUE_ENTRY_NOT_FOUND', 'Queue entry not found.');
    if (!data.doctors.some((doctor) => doctor.doctorId === doctorId && doctor.status === 'active')) {
      return fail('DOCTOR_UNAVAILABLE', 'Select an active referral doctor.');
    }
    entry.referralDoctorId = doctorId;
    entry.referralReason = String(reason || '').trim();
    entry.updatedAt = now.toISOString();
    return ok({ queueEntry: entry });
  });
}

export function parseAppointmentQrPayload(payload) {
  const match = String(payload || '').trim().match(/^clinicbook:appointment:([a-z0-9_-]+)$/i);
  return match ? match[1] : null;
}

export function validateAppointmentQr(payload, data, now = new Date()) {
  const appointmentId = parseAppointmentQrPayload(payload);
  if (!appointmentId) return fail('INVALID_QR', 'This QR code is not a ClinicBook appointment code.');
  const appointment = data.appointments.find((entry) => entry.appointmentId === appointmentId);
  if (!appointment) return fail('APPOINTMENT_NOT_FOUND', 'No appointment matches this QR code.');
  if (!data.patients.some((patient) => patient.patientId === appointment.patientId) ||
      !data.doctors.some((doctor) => doctor.doctorId === appointment.doctorId)) {
    return fail('INVALID_APPOINTMENT', 'This appointment is missing its patient or doctor record.');
  }
  if (appointment.status !== 'Booked') return fail('INVALID_STATUS', 'Only booked appointments can be checked in.');
  if (appointment.date !== toISODate(now)) return fail('WRONG_DATE', 'This appointment is not scheduled for today.');
  if (appointment.checkedInAt || (data.queueEntries || []).some((entry) => entry.appointmentId === appointmentId)) {
    return fail('ALREADY_CHECKED_IN', 'This appointment has already been checked in.');
  }
  return ok({ appointment });
}

export function checkInAppointmentByQr({ payload, actor }, now = new Date()) {
  if (!can(actor, 'qrCheckIn')) return fail('UNAUTHORIZED', 'Only receptionists can check in appointments.');
  const appointmentId = parseAppointmentQrPayload(payload);
  if (!appointmentId) return fail('INVALID_QR', 'This QR code is not a ClinicBook appointment code.');
  return transact((data) => {
    const appointment = data.appointments.find((entry) => entry.appointmentId === appointmentId);
    if (!appointment) return fail('APPOINTMENT_NOT_FOUND', 'No appointment matches this QR code.');
    if (!data.patients.some((patient) => patient.patientId === appointment.patientId) ||
        !data.doctors.some((doctor) => doctor.doctorId === appointment.doctorId)) {
      return fail('INVALID_APPOINTMENT', 'This appointment is missing its patient or doctor record.');
    }
    if (appointment.status !== 'Booked') return fail('INVALID_STATUS', 'Only booked appointments can be checked in.');
    if (appointment.date !== toISODate(now)) return fail('WRONG_DATE', 'This appointment is not scheduled for today.');
    if (appointment.checkedInAt || (data.queueEntries || []).some((entry) => entry.appointmentId === appointmentId)) {
      return fail('ALREADY_CHECKED_IN', 'This appointment has already been checked in.');
    }
    appointment.checkedInAt = now.toISOString();
    data.queueEntries ||= [];
    const queueEntry = makeQueueEntry({
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      appointmentId,
      now,
      entryType: 'ScheduledCheckIn',
    });
    data.queueEntries.push(queueEntry);
    return ok({ appointment, queueEntry });
  });
}
