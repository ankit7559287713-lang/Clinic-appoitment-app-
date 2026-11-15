// Slots: list, derive status, add, remove, detect overlaps.
import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';
import { validateSlotInput, hasErrors } from './validators.js';
import { timeToMinutes, minutesToTime, rangesOverlap, isPastSlot, toDateTime, formatTime } from './dateUtils.js';

/** Availability is derived from appointments — never stored on the slot. */
export function isSlotBooked(data, slotId) {
  return data.appointments.some((a) => a.slotId === slotId && a.status === 'Booked');
}

export function getSlotStatus(data, slot) {
  return isSlotBooked(data, slot.slotId) ? 'Booked' : 'Available';
}

const byStart = (a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date));

export function listSlots(data, { doctorId, date } = {}, now = new Date()) {
  return data.slots
    .filter((s) => (!doctorId || s.doctorId === doctorId) && (!date || s.date === date))
    .map((s) => ({ ...s, status: getSlotStatus(data, s), isPast: isPastSlot(s, now) }))
    .sort(byStart);
}

export function findOverlappingSlot(data, { doctorId, date, startTime, endTime, ignoreSlotId = null }) {
  const a = timeToMinutes(startTime);
  const b = timeToMinutes(endTime);
  return data.slots.find(
    (s) => s.doctorId === doctorId && s.date === date && s.slotId !== ignoreSlotId &&
      rangesOverlap(a, b, timeToMinutes(s.startTime), timeToMinutes(s.endTime)),
  ) || null;
}

export function nextAvailableSlot(data, doctorId, now = new Date()) {
  return listSlots(data, { doctorId }, now).find((s) => s.status === 'Available' && !s.isPast) || null;
}

export function countAvailable(data, { doctorId, date }, now = new Date()) {
  return listSlots(data, { doctorId, date }, now).filter((s) => s.status === 'Available' && !s.isPast).length;
}

export function addSlot({ doctorId, date, startTime, duration, actor }, now = new Date()) {
  if (!can(actor, 'addSlot', { doctorId })) return fail('UNAUTHORIZED', 'Only the doctor can add slots to their own schedule.');
  const errors = validateSlotInput({ date, startTime, duration }, now);
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please fix the highlighted fields.', { errors });
  const endTime = minutesToTime(timeToMinutes(startTime) + Number(duration));

  return transact((data) => {
    const doctor = data.doctors.find((d) => d.doctorId === doctorId);
    if (!doctor) return fail('DOCTOR_NOT_FOUND', 'Doctor not found.');
    const clash = findOverlappingSlot(data, { doctorId, date, startTime, endTime });
    if (clash) {
      return fail('SLOT_OVERLAP', `This overlaps your ${formatTime(clash.startTime)}–${formatTime(clash.endTime)} slot. Choose a different time.`, { clash });
    }
    const slot = { slotId: newId('s'), doctorId, date, startTime, endTime };
    data.slots.push(slot);
    return ok({ slot });
  });
}

export function removeSlot({ slotId, actor }) {
  return transact((data) => {
    const slot = data.slots.find((s) => s.slotId === slotId);
    if (!slot) return fail('SLOT_NOT_FOUND', 'That slot no longer exists.');
    if (!can(actor, 'removeSlot', { doctorId: slot.doctorId })) return fail('UNAUTHORIZED', 'You can only remove your own slots.');
    if (isSlotBooked(data, slotId)) return fail('SLOT_HAS_BOOKING', 'This slot has an active appointment and cannot be removed.');
    data.slots = data.slots.filter((s) => s.slotId !== slotId);
    return ok({ slot });
  });
}

export { toDateTime };
