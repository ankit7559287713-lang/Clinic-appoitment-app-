// Booking rules. Every mutation re-reads storage, checks, and writes in ONE
// synchronous call (transact) so a slot can never hold two active appointments.
import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';
import { validateReason, hasErrors } from './validators.js';
import { isSlotBooked } from './slotService.js';
import { isPastSlot, rangesOverlap, toDateTime, formatTime, timeToMinutes, minutesToTime } from './dateUtils.js';

export const MESSAGES = {
  SLOT_TAKEN: 'That slot was just booked. Please choose another time.',
  PATIENT_OVERLAP: 'You already have an appointment at that time.',
  SLOT_IN_PAST: 'That time has already passed. Please choose a future slot.',
  SLOT_NOT_FOUND: 'That slot is no longer available. Please refresh and choose another.',
  ALREADY_CANCELLED: 'This appointment is already cancelled.',
  UNAUTHORIZED: 'Your current role cannot perform this action.',
};

export function findPatientOverlap(data, patientId, slot, ignoreAppointmentId = null) {
  const s = toDateTime(slot.date, slot.startTime).getTime();
  const e = toDateTime(slot.date, slot.endTime).getTime();
  return data.appointments.find((a) =>
    a.patientId === patientId && a.status === 'Booked' && a.appointmentId !== ignoreAppointmentId &&
    rangesOverlap(s, e, toDateTime(a.date, a.startTime).getTime(), toDateTime(a.date, a.blockEndTime || a.endTime).getTime()),
  ) || null;
}

export function bookAppointment({ slotId, patientId, reason, actor }, now = new Date()) {
  if (!can(actor, 'book', { patientId })) return fail('UNAUTHORIZED', MESSAGES.UNAUTHORIZED);
  const errors = validateReason(reason);
  if (hasErrors(errors)) return fail('INVALID_INPUT', errors.reason, { errors });

  return transact((data) => {
    const slot = data.slots.find((s) => s.slotId === slotId);
    if (!slot) return fail('SLOT_NOT_FOUND', MESSAGES.SLOT_NOT_FOUND);
    if (slot.legacyBlock || toDateTime(slot.date, slot.endTime) - toDateTime(slot.date, slot.startTime) !== 30 * 60 * 1000) {
      return fail('SLOT_NOT_FOUND', MESSAGES.SLOT_NOT_FOUND);
    }
    const patient = data.patients.find((p) => p.patientId === patientId);
    if (!patient) return fail('PATIENT_NOT_FOUND', 'Patient not found.');
    const doctor = data.doctors.find((d) => d.doctorId === slot.doctorId);
    if (!doctor || doctor.status !== 'active') return fail('DOCTOR_UNAVAILABLE', 'This doctor is not taking bookings right now.');
    if (isPastSlot(slot, now)) return fail('SLOT_IN_PAST', MESSAGES.SLOT_IN_PAST);
    if (isSlotBooked(data, slotId)) return fail('SLOT_TAKEN', MESSAGES.SLOT_TAKEN);
    const clash = findPatientOverlap(data, patientId, slot);
    if (clash) {
      return fail('PATIENT_OVERLAP', `${MESSAGES.PATIENT_OVERLAP} (${formatTime(clash.startTime)}–${formatTime(clash.endTime)})`, { clash });
    }

    const appointment = {
      appointmentId: newId('a'),
      slotId,
      doctorId: slot.doctorId,
      patientId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.consultationEndTime || minutesToTime(timeToMinutes(slot.startTime) + 15),
      blockEndTime: slot.endTime,
      consultationEndTime: slot.consultationEndTime,
      reason: reason.trim(),
      status: 'Booked',
      consultationStatus: 'Scheduled',
      createdAt: now.toISOString(),
      createdByRole: actor.role,
      createdById: actor.receptionistId || actor.patientId || actor.doctorId || null,
      cancelledAt: null,
      completedAt: null,
    };
    data.appointments.push(appointment);
    return ok({ appointment, slot, doctor, patient });
  });
}

export function cancelAppointment({ appointmentId, actor }, now = new Date()) {
  return transact((data) => {
    const appt = data.appointments.find((a) => a.appointmentId === appointmentId);
    if (!appt) return fail('APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    if (!can(actor, 'cancel', { appointment: appt })) return fail('UNAUTHORIZED', MESSAGES.UNAUTHORIZED);
    if (appt.status === 'Cancelled') return fail('ALREADY_CANCELLED', MESSAGES.ALREADY_CANCELLED);
    if (appt.status !== 'Booked') return fail('INVALID_STATUS', 'Completed appointments cannot be cancelled.');
    appt.status = 'Cancelled';
    appt.consultationStatus = 'Cancelled';
    appt.cancelledAt = now.toISOString();
    appt.cancelledByRole = actor.role;
    appt.cancelledById = actor.receptionistId || actor.patientId || actor.doctorId || null;
    const queueEntry = (data.queueEntries || []).find((entry) => entry.appointmentId === appointmentId);
    if (queueEntry && ['Waiting', 'Consulting'].includes(queueEntry.status)) {
      queueEntry.status = 'Cancelled';
      queueEntry.updatedAt = now.toISOString();
      queueEntry.statusHistory ||= [];
      queueEntry.statusHistory.push({ status: 'Cancelled', at: now.toISOString(), actorRole: actor.role, actorId: actor.receptionistId || actor.patientId || actor.doctorId || null });
    }
    return ok({ appointment: appt });
  });
}

export function completeAppointment({ appointmentId, actor }, now = new Date()) {
  return transact((data) => {
    const appt = data.appointments.find((a) => a.appointmentId === appointmentId);
    if (!appt) return fail('APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    if (!can(actor, 'complete', { appointment: appt })) return fail('UNAUTHORIZED', MESSAGES.UNAUTHORIZED);
    if (appt.status !== 'Booked') return fail('INVALID_STATUS', `Only booked appointments can be completed (this one is ${appt.status}).`);
    appt.status = 'Completed';
    appt.consultationStatus = 'Completed';
    appt.completedAt = now.toISOString();
    const queueEntry = (data.queueEntries || []).find((entry) => entry.appointmentId === appointmentId);
    if (queueEntry) {
      queueEntry.status = 'Completed';
      queueEntry.completedAt = now.toISOString();
      queueEntry.updatedAt = now.toISOString();
      queueEntry.statusHistory ||= [];
      queueEntry.statusHistory.push({ status: 'Completed', at: now.toISOString(), actorRole: actor.role, actorId: actor.doctorId });
    }
    return ok({ appointment: appt });
  });
}

export function startConsultation({ appointmentId, actor }, now = new Date()) {
  return transact((data) => {
    const appt = data.appointments.find((a) => a.appointmentId === appointmentId);
    if (!appt) return fail('APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    if (!can(actor, 'startConsultation', { appointment: appt })) return fail('UNAUTHORIZED', MESSAGES.UNAUTHORIZED);
    if (appt.status !== 'Booked') return fail('INVALID_STATUS', 'Only booked appointments can be started.');
    if (appt.consultationStatus === 'InProgress') return fail('INVALID_STATUS', 'This consultation is already in progress.');
    appt.consultationStatus = 'InProgress';
    appt.consultationStartedAt = now.toISOString();
    const queueEntry = (data.queueEntries || []).find((entry) => entry.appointmentId === appointmentId && entry.status === 'Waiting');
    if (queueEntry) {
      queueEntry.status = 'Consulting';
      queueEntry.updatedAt = now.toISOString();
      queueEntry.statusHistory ||= [];
      queueEntry.statusHistory.push({ status: 'Consulting', at: now.toISOString(), actorRole: actor.role, actorId: actor.doctorId });
    }
    return ok({ appointment: appt });
  });
}

/** Derived lists — never stored. */
export function classifyAppointments(appointments, now = new Date()) {
  const upcoming = [], past = [], cancelled = [];
  for (const a of appointments) {
    if (a.status === 'Cancelled') cancelled.push(a);
    else if (a.status === 'Booked' && toDateTime(a.date, a.startTime) > now) upcoming.push(a);
    else past.push(a);
  }
  const asc = (x, y) => (x.date + x.startTime).localeCompare(y.date + y.startTime);
  upcoming.sort(asc);
  past.sort((x, y) => asc(y, x));
  cancelled.sort((x, y) => asc(y, x));
  return { upcoming, past, cancelled };
}
