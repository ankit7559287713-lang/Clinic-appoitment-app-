import { transact, ok, fail, newId, loadData } from './storage.js';
import { can } from './roleGuard.js';
import { validateReason, hasErrors } from './validators.js';
import { isEmergencyBufferAvailable } from './slotService.js';
import { rangesOverlap, toDateTime } from './dateUtils.js';

const bufferRange = (slot) => ({
  start: toDateTime(slot.date, slot.emergencyBufferStartTime || slot.consultationEndTime).getTime(),
  end: toDateTime(slot.date, slot.emergencyBufferEndTime || slot.endTime).getTime(),
});

export function listEmergencyRequests(data, { patientId, doctorId } = {}) {
  return (data.emergencyRequests || [])
    .filter((request) =>
      (!patientId || request.patientId === patientId) &&
      (!doctorId || (request.doctorId === doctorId && ['Approved', 'In Progress', 'Completed'].includes(request.status))),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function requestEmergency({ patientId, doctorId, slotId, reason, actor }, now = new Date()) {
  if (!can(actor, 'emergencyRequest', { patientId })) return fail('UNAUTHORIZED', 'You can only request emergency care for yourself.');
  const errors = validateReason(reason);
  if (hasErrors(errors)) return fail('INVALID_INPUT', errors.reason, { errors });
  return transact((data) => {
    const patient = data.patients.find((entry) => entry.patientId === patientId);
    const doctor = data.doctors.find((entry) => entry.doctorId === doctorId);
    if (!patient) return fail('PATIENT_NOT_FOUND', 'Patient not found.');
    if (!doctor || doctor.status !== 'active') return fail('DOCTOR_UNAVAILABLE', 'That doctor is not available for emergency requests.');
    const pending = (data.emergencyRequests || []).find((request) =>
      request.patientId === patientId && request.status === 'pending_approval',
    );
    if (pending) return fail('REQUEST_ALREADY_PENDING', 'You already have a pending emergency request.', { request: pending });
    const slot = data.slots.find((entry) => entry.slotId === slotId && entry.doctorId === doctorId);
    if (!slot || !chooseBuffer(data, { patientId, doctorId }, doctorId, slotId, now)) {
      return fail('BUFFER_UNAVAILABLE', 'Choose an available future emergency time for this doctor.');
    }
    const request = {
      requestId: newId('em'),
      patientId,
      doctorId,
      slotId,
      reason: reason.trim(),
      status: 'pending_approval',
      createdAt: now.toISOString(),
      statusHistory: [{ status: 'pending_approval', at: now.toISOString(), actorRole: actor.role }],
    };
    data.emergencyRequests ||= [];
    data.emergencyRequests.push(request);
    return ok({ request, patient, doctor, slot });
  });
}

function chooseBuffer(data, request, doctorId, slotId, now) {
  const candidates = data.slots
    .filter((slot) => slot.slotId === slotId && slot.doctorId === doctorId)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return candidates.find((slot) => {
    if (!isEmergencyBufferAvailable(data, slot, request.requestId || null)) return false;
    const start = toDateTime(slot.date, slot.emergencyBufferStartTime || slot.consultationEndTime);
    if (start <= now) return false;
    const range = bufferRange(slot);
    const emergencyClash = (data.emergencyRequests || []).some((other) => {
      if (other.requestId === request.requestId ||
          !['pending_approval', 'Approved', 'In Progress', 'Accepted', 'Legacy Accepted'].includes(other.status) ||
          !other.slotId) return false;
      const otherSlot = data.slots.find((item) => item.slotId === other.slotId);
      if (!otherSlot) return false;
      const otherRange = bufferRange(otherSlot);
      return rangesOverlap(range.start, range.end, otherRange.start, otherRange.end);
    });
    if (emergencyClash) return false;
    const consultationClash = data.appointments.some((appointment) => {
      if (appointment.doctorId !== request.doctorId || appointment.status !== 'Booked') return false;
      const appointmentStart = toDateTime(appointment.date, appointment.startTime).getTime();
      const appointmentEnd = toDateTime(appointment.date, appointment.consultationEndTime || appointment.endTime).getTime();
      return rangesOverlap(range.start, range.end, appointmentStart, appointmentEnd);
    });
    if (consultationClash) return false;
    const patientClash = data.appointments.some((appointment) => {
      if (appointment.patientId !== request.patientId || appointment.status !== 'Booked') return false;
      const appointmentStart = toDateTime(appointment.date, appointment.startTime).getTime();
      const appointmentEnd = toDateTime(appointment.date, appointment.blockEndTime || appointment.endTime).getTime();
      return rangesOverlap(range.start, range.end, appointmentStart, appointmentEnd);
    });
    return !patientClash;
  }) || null;
}

export function approveEmergencyRequest({ requestId, actor }, now = new Date()) {
  return transact((data) => {
    const request = (data.emergencyRequests || []).find((entry) => entry.requestId === requestId);
    if (!request) return fail('REQUEST_NOT_FOUND', 'Emergency request not found.');
    if (!can(actor, 'emergencyDecision')) return fail('UNAUTHORIZED', 'Only a receptionist can approve this request.');
    if (request.status !== 'pending_approval') return fail('INVALID_STATUS', `This request is already ${request.status.toLowerCase()}.`);
    if (request.appointmentId || data.appointments.some((appointment) => appointment.emergencyRequestId === requestId)) {
      return fail('INVALID_STATUS', 'This emergency request already has an appointment.');
    }
    const assignedDoctor = data.doctors.find((doctor) => doctor.doctorId === request.doctorId && doctor.status === 'active');
    if (!assignedDoctor) return fail('DOCTOR_UNAVAILABLE', 'The requested doctor is not available for this emergency case.');
    const slot = chooseBuffer(data, request, request.doctorId, request.slotId, now);
    if (!slot) return fail('BUFFER_UNAVAILABLE', 'No future emergency buffer is available for this request.');

    const patient = data.patients.find((entry) => entry.patientId === request.patientId);
    if (!patient) return fail('PATIENT_NOT_FOUND', 'Patient not found.');
    const startTime = slot.emergencyBufferStartTime || slot.consultationEndTime;
    const endTime = slot.emergencyBufferEndTime || slot.endTime;
    const appointment = {
      appointmentId: newId('a'),
      emergencyRequestId: requestId,
      isEmergency: true,
      slotId: slot.slotId,
      doctorId: request.doctorId,
      patientId: request.patientId,
      date: slot.date,
      startTime,
      endTime,
      blockEndTime: endTime,
      consultationEndTime: endTime,
      reason: request.reason,
      status: 'Booked',
      consultationStatus: 'Scheduled',
      createdAt: now.toISOString(),
      createdByRole: actor.role,
      createdById: actor.receptionistId || null,
      cancelledAt: null,
      completedAt: null,
    };
    data.appointments.push(appointment);

    request.status = 'Approved';
    request.approvedAt = now.toISOString();
    request.appointmentId = appointment.appointmentId;
    request.verifiedById = actor.receptionistId;
    request.decidedById = actor.receptionistId;
    request.statusHistory ||= [];
    request.statusHistory.push({ status: 'Approved', at: now.toISOString(), actorRole: actor.role, actorId: actor.receptionistId, doctorId: request.doctorId, slotId: slot.slotId, appointmentId: appointment.appointmentId });
    return ok({ request, appointment, slot, doctor: assignedDoctor, patient, buffer: { startTime, endTime } });
  });
}

export function rejectEmergencyRequest({ requestId, actor }, now = new Date()) {
  return transact((data) => {
    const request = (data.emergencyRequests || []).find((entry) => entry.requestId === requestId);
    if (!request) return fail('REQUEST_NOT_FOUND', 'Emergency request not found.');
    if (!can(actor, 'emergencyDecision')) return fail('UNAUTHORIZED', 'Only a receptionist can reject this request.');
    if (request.status !== 'pending_approval') return fail('INVALID_STATUS', `This request is already ${request.status.toLowerCase()}.`);
    request.status = 'rejected';
    request.rejectedAt = now.toISOString();
    request.verifiedById = actor.receptionistId;
    request.decidedById = actor.receptionistId;
    request.statusHistory ||= [];
    request.statusHistory.push({ status: 'rejected', at: now.toISOString(), actorRole: actor.role, actorId: actor.receptionistId });
    return ok({ request });
  });
}

export const acceptEmergencyRequest = approveEmergencyRequest;

export function updateEmergencyCase({ requestId, status, actor }, now = new Date()) {
  if (!['In Progress', 'Completed'].includes(status)) return fail('INVALID_STATUS', 'Choose a supported emergency case status.');
  return transact((data) => {
    const request = (data.emergencyRequests || []).find((entry) => entry.requestId === requestId);
    if (!request) return fail('REQUEST_NOT_FOUND', 'Emergency request not found.');
    if (!can(actor, 'emergencyManage', { emergency: request })) return fail('UNAUTHORIZED', 'Only the assigned doctor can manage this emergency case.');
    if (!['Approved', 'In Progress'].includes(request.status)) return fail('INVALID_STATUS', 'Only an approved emergency case can be managed.');
    if (request.status === 'In Progress' && status === 'In Progress') return fail('INVALID_STATUS', 'This emergency case is already in progress.');
    if (status === 'Completed' && !(data.consultations || []).some((record) =>
      record.encounterId === requestId && record.patientId === request.patientId && record.doctorId === request.doctorId,
    )) {
      return fail('CLINICAL_RECORD_REQUIRED', 'Save the emergency consultation before completing this case.');
    }
    request.status = status;
    request.statusHistory ||= [];
    request.statusHistory.push({ status, at: now.toISOString(), actorRole: actor.role, actorId: actor.doctorId });
    request.completedAt = status === 'Completed' ? now.toISOString() : request.completedAt || null;
    if (status === 'Completed') {
      const appointment = (data.appointments || []).find((entry) => entry.emergencyRequestId === requestId);
      if (appointment?.status === 'Booked') {
        appointment.status = 'Completed';
        appointment.consultationStatus = 'Completed';
        appointment.completedAt = now.toISOString();
      }
    }
    return ok({ request });
  });
}

export function emergencyBuffers(data, doctorId, now = new Date()) {
  return data.slots.filter((slot) => slot.doctorId === doctorId &&
    isEmergencyBufferAvailable(data, slot) &&
    toDateTime(slot.date, slot.emergencyBufferStartTime || slot.consultationEndTime) > now)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

export function availableEmergencyBuffers(doctorId, now = new Date()) {
  const data = loadData(now);
  return emergencyBuffers(data, doctorId, now);
}
