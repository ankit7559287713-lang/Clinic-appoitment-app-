// Run with: npm test  (Node 18+ built-in test runner)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setBackend, createMemoryBackend, loadData, resetData } from '../js/logic/storage.js';
import { bookAppointment, cancelAppointment, completeAppointment } from '../js/logic/bookingService.js';
import { addSlot, removeSlot, listSlots, isSlotBooked } from '../js/logic/slotService.js';
import { validatePatient, validateSlotInput } from '../js/logic/validators.js';
import { can, canAccessPage } from '../js/logic/roleGuard.js';
import { loginPatient, loginDoctor, loginReceptionist } from '../js/logic/authService.js';
import { addReview, updateReview, deleteReview, doctorRating, reviewForAppointment, visitsAwaitingReview } from '../js/logic/reviewService.js';
import { toISODate, addDays } from '../js/logic/dateUtils.js';

// Fixed clock: Wednesday 08:00 local time.
const NOW = new Date(2026, 10, 18, 8, 0, 0);
const day = (n) => toISODate(addDays(NOW, n));
const patient = (id) => ({ role: 'patient', patientId: id });
const doctor = (id) => ({ role: 'doctor', doctorId: id });

function freeSlot(doctorId, date) {
  return listSlots(loadData(NOW), { doctorId, date }, NOW).find((s) => s.status === 'Available' && !s.isPast);
}

beforeEach(() => {
  setBackend(createMemoryBackend());
  resetData(NOW);
});

test('two patients booking the same slot: only the first succeeds', () => {
  const slot = freeSlot('d3', day(4));
  const a = bookAppointment({ slotId: slot.slotId, patientId: 'p5', reason: 'Skin check', actor: patient('p5') }, NOW);
  const b = bookAppointment({ slotId: slot.slotId, patientId: 'p6', reason: 'Rash', actor: patient('p6') }, NOW);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.equal(b.code, 'SLOT_TAKEN');
  const active = loadData(NOW).appointments.filter((x) => x.slotId === slot.slotId && x.status === 'Booked');
  assert.equal(active.length, 1);
});

test('the same booking submitted twice is rejected the second time', () => {
  const slot = freeSlot('d1', day(6));
  const req = { slotId: slot.slotId, patientId: 'p2', reason: 'Check-up', actor: patient('p2') };
  assert.equal(bookAppointment(req, NOW).ok, true);
  const again = bookAppointment(req, NOW);
  assert.equal(again.ok, false);
  assert.equal(again.code, 'SLOT_TAKEN');
});

test('cancel then rebook: the freed slot can be booked by someone else', () => {
  const slot = freeSlot('d4', day(6));
  const first = bookAppointment({ slotId: slot.slotId, patientId: 'p1', reason: 'Vaccination', actor: patient('p1') }, NOW);
  assert.equal(cancelAppointment({ appointmentId: first.appointment.appointmentId, actor: patient('p1') }, NOW).ok, true);
  assert.equal(isSlotBooked(loadData(NOW), slot.slotId), false);
  const second = bookAppointment({ slotId: slot.slotId, patientId: 'p3', reason: 'Fever', actor: patient('p3') }, NOW);
  assert.equal(second.ok, true);
  const history = loadData(NOW).appointments.filter((x) => x.slotId === slot.slotId);
  assert.deepEqual(history.map((x) => x.status).sort(), ['Booked', 'Cancelled']);
});

test('overlapping slots for one doctor are rejected', () => {
  const ok1 = addSlot({ doctorId: 'd1', date: day(6), startTime: '17:00', duration: 30, actor: doctor('d1') }, NOW);
  assert.equal(ok1.ok, true);
  const clash = addSlot({ doctorId: 'd1', date: day(6), startTime: '17:15', duration: 30, actor: doctor('d1') }, NOW);
  assert.equal(clash.ok, false);
  assert.equal(clash.code, 'SLOT_OVERLAP');
  const touching = addSlot({ doctorId: 'd1', date: day(6), startTime: '17:30', duration: 30, actor: doctor('d1') }, NOW);
  assert.equal(touching.ok, true, 'back-to-back slots do not overlap');
});

test('a patient cannot book overlapping times with two doctors', () => {
  // Sample data: p1 has Dr. Chen (d2) at 10:00–10:45 on day +3.
  const d1Slot = listSlots(loadData(NOW), { doctorId: 'd1', date: day(3) }, NOW).find((s) => s.startTime === '10:30');
  const res = bookAppointment({ slotId: d1Slot.slotId, patientId: 'p1', reason: 'Overlap test', actor: patient('p1') }, NOW);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'PATIENT_OVERLAP');
});

test('booking a past slot is rejected', () => {
  const past = listSlots(loadData(NOW), { doctorId: 'd5', date: day(-1) }, NOW).find((s) => s.status === 'Available');
  const res = bookAppointment({ slotId: past.slotId, patientId: 'p2', reason: 'Too late', actor: patient('p2') }, NOW);
  assert.equal(res.code, 'SLOT_IN_PAST');
});

test('cancelling an already cancelled appointment is rejected', () => {
  const slot = freeSlot('d2', day(5));
  const r = bookAppointment({ slotId: slot.slotId, patientId: 'p4', reason: 'BP review', actor: patient('p4') }, NOW);
  const id = r.appointment.appointmentId;
  assert.equal(cancelAppointment({ appointmentId: id, actor: patient('p4') }, NOW).ok, true);
  const again = cancelAppointment({ appointmentId: id, actor: patient('p4') }, NOW);
  assert.equal(again.code, 'ALREADY_CANCELLED');
});

test('only Booked appointments can be completed, by their own doctor', () => {
  const slot = freeSlot('d2', day(5));
  const r = bookAppointment({ slotId: slot.slotId, patientId: 'p4', reason: 'BP review', actor: patient('p4') }, NOW);
  const id = r.appointment.appointmentId;
  assert.equal(completeAppointment({ appointmentId: id, actor: doctor('d1') }, NOW).code, 'UNAUTHORIZED');
  assert.equal(completeAppointment({ appointmentId: id, actor: doctor('d2') }, NOW).ok, true);
  assert.equal(completeAppointment({ appointmentId: id, actor: doctor('d2') }, NOW).code, 'INVALID_STATUS');
  assert.equal(cancelAppointment({ appointmentId: id, actor: patient('p4') }, NOW).code, 'INVALID_STATUS');
});

test('a slot with an active appointment cannot be removed', () => {
  const booked = listSlots(loadData(NOW), { doctorId: 'd1', date: day(1) }, NOW)[0];
  assert.equal(booked.status, 'Booked');
  assert.equal(removeSlot({ slotId: booked.slotId, actor: doctor('d1') }).code, 'SLOT_HAS_BOOKING');
  const free = freeSlot('d1', day(6));
  assert.equal(removeSlot({ slotId: free.slotId, actor: doctor('d2') }).code, 'UNAUTHORIZED');
  assert.equal(removeSlot({ slotId: free.slotId, actor: doctor('d1') }).ok, true);
});

test('patients can only book and cancel for themselves', () => {
  const slot = freeSlot('d4', day(4));
  assert.equal(bookAppointment({ slotId: slot.slotId, patientId: 'p2', reason: 'Not mine', actor: patient('p1') }, NOW).code, 'UNAUTHORIZED');
  const r = bookAppointment({ slotId: slot.slotId, patientId: 'p2', reason: 'Mine', actor: patient('p2') }, NOW);
  assert.equal(cancelAppointment({ appointmentId: r.appointment.appointmentId, actor: patient('p1') }, NOW).code, 'UNAUTHORIZED');
  assert.equal(cancelAppointment({ appointmentId: r.appointment.appointmentId, actor: patient('p2') }, NOW).ok, true);
});

test('validators catch bad input', () => {
  assert.ok(validatePatient({ name: '', phone: '12' }).name);
  assert.ok(validatePatient({ name: 'Ann', phone: '12' }).phone);
  assert.deepEqual(validatePatient({ name: 'Ann Lee', phone: '555-010-2001' }), {});
  assert.ok(validateSlotInput({ date: day(-1), startTime: '10:00', duration: 30 }, NOW).startTime);
  assert.ok(validateSlotInput({ date: day(1), startTime: '23:50', duration: 30 }, NOW).duration);
  assert.deepEqual(validateSlotInput({ date: day(1), startTime: '10:00', duration: 30 }, NOW), {});
});

test('role guard limits pages and actions', () => {
  assert.equal(canAccessPage('patient', 'schedule'), false);
  assert.equal(canAccessPage('doctor', 'schedule'), true);
  assert.equal(canAccessPage(null, 'settings'), true);
  assert.equal(can(doctor('d1'), 'book', { patientId: 'p1' }), false);
  assert.equal(canAccessPage('patient', 'frontdesk'), false);
  assert.equal(can({ role: 'receptionist', receptionistId: 'rec1' }, 'book', { patientId: 'p1' }), true, 'receptionist can book for a patient');
});

test('patient login matches a registered phone number', () => {
  const data = loadData(NOW);
  assert.equal(loginPatient(data, '555-010-2001').session.patientId, 'p1');
  assert.equal(loginPatient(data, '(555) 010 2003').session.patientId, 'p3', 'formatting is ignored');
  assert.equal(loginPatient(data, '').code, 'INVALID_INPUT');
  assert.equal(loginPatient(data, '12345').code, 'INVALID_INPUT');
  assert.equal(loginPatient(data, '555-999-0000').code, 'NOT_FOUND');
});

test('doctor login matches a staff ID', () => {
  const data = loadData(NOW);
  assert.equal(loginDoctor(data, 'DOC-101').session.doctorId, 'd1');
  assert.equal(loginDoctor(data, ' doc204 ').session.doctorId, 'd2', 'case, spaces and the dash are optional');
  assert.equal(loginDoctor(data, '').code, 'INVALID_INPUT');
  assert.equal(loginDoctor(data, 'nurse-1').code, 'INVALID_INPUT');
  assert.equal(loginDoctor(data, 'DOC-999').code, 'NOT_FOUND');
});

// ---------------- reviews ----------------
const unreviewedVisit = (patientId) => visitsAwaitingReview(loadData(NOW), patientId)[0];

test('a patient can review their own completed visit once', () => {
  const visit = unreviewedVisit('p1');
  assert.ok(visit, 'sample data leaves p1 a visit to review');
  const before = doctorRating(loadData(NOW), visit.doctorId);
  const res = addReview({ appointmentId: visit.appointmentId, rating: 4, comment: '  Helpful  ', actor: patient('p1') }, NOW);
  assert.equal(res.ok, true);
  assert.equal(res.review.comment, 'Helpful');
  const after = doctorRating(loadData(NOW), visit.doctorId);
  assert.equal(after.count, before.count + 1);
  const again = addReview({ appointmentId: visit.appointmentId, rating: 5, actor: patient('p1') }, NOW);
  assert.equal(again.code, 'ALREADY_REVIEWED');
});

test('reviews need a completed visit owned by the reviewer', () => {
  const visit = unreviewedVisit('p1');
  assert.equal(addReview({ appointmentId: visit.appointmentId, rating: 5, actor: patient('p2') }, NOW).code, 'UNAUTHORIZED');
  assert.equal(addReview({ appointmentId: visit.appointmentId, rating: 5, actor: doctor(visit.doctorId) }, NOW).code, 'UNAUTHORIZED');
  const upcoming = loadData(NOW).appointments.find((a) => a.patientId === 'p1' && a.status === 'Booked');
  assert.equal(addReview({ appointmentId: upcoming.appointmentId, rating: 5, actor: patient('p1') }, NOW).code, 'NOT_COMPLETED');
  const cancelled = loadData(NOW).appointments.find((a) => a.patientId === 'p1' && a.status === 'Cancelled');
  assert.equal(addReview({ appointmentId: cancelled.appointmentId, rating: 5, actor: patient('p1') }, NOW).code, 'NOT_COMPLETED');
});

test('review input is validated', () => {
  const visit = unreviewedVisit('p1');
  const send = (rating, comment = '') => addReview({ appointmentId: visit.appointmentId, rating, comment, actor: patient('p1') }, NOW).code;
  assert.equal(send(undefined), 'INVALID_INPUT');
  assert.equal(send(0), 'INVALID_INPUT');
  assert.equal(send(6), 'INVALID_INPUT');
  assert.equal(send(3.5), 'INVALID_INPUT');
  assert.equal(send(5, 'x'.repeat(301)), 'INVALID_INPUT');
  assert.equal(reviewForAppointment(loadData(NOW), visit.appointmentId), null, 'nothing saved on invalid input');
});

test('only the author can edit or delete a review; rating is recalculated', () => {
  const data = loadData(NOW);
  const mine = data.reviews.find((r) => r.patientId === 'p1');
  assert.equal(updateReview({ reviewId: mine.reviewId, rating: 1, actor: patient('p2') }, NOW).code, 'UNAUTHORIZED');
  assert.equal(updateReview({ reviewId: mine.reviewId, rating: 2, comment: 'Changed my mind', actor: patient('p1') }, NOW).ok, true);
  const edited = loadData(NOW).reviews.find((r) => r.reviewId === mine.reviewId);
  assert.equal(edited.rating, 2);
  assert.ok(edited.updatedAt);
  assert.equal(deleteReview({ reviewId: mine.reviewId, actor: patient('p2') }).code, 'UNAUTHORIZED');
  const countBefore = doctorRating(loadData(NOW), mine.doctorId).count;
  assert.equal(deleteReview({ reviewId: mine.reviewId, actor: patient('p1') }).ok, true);
  assert.equal(doctorRating(loadData(NOW), mine.doctorId).count, countBefore - 1);
});

test('doctor rating is the rounded average with a star distribution', () => {
  const data = { reviews: [{ doctorId: 'x', rating: 5 }, { doctorId: 'x', rating: 4 }, { doctorId: 'x', rating: 4 }, { doctorId: 'y', rating: 1 }] };
  const r = doctorRating(data, 'x');
  assert.equal(r.average, 4.3);
  assert.equal(r.count, 3);
  assert.deepEqual(r.distribution.map((d) => d.count), [1, 2, 0, 0, 0]);
  assert.deepEqual(doctorRating(data, 'z'), { average: null, count: 0, distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 })) });
});

test('sample reviews all belong to completed visits by the reviewer', () => {
  const data = loadData(NOW);
  assert.ok(data.reviews.length >= 10);
  for (const r of data.reviews) {
    const a = data.appointments.find((x) => x.appointmentId === r.appointmentId);
    assert.equal(a.status, 'Completed');
    assert.equal(a.patientId, r.patientId);
    assert.equal(a.doctorId, r.doctorId);
  }
  assert.equal(new Set(data.reviews.map((r) => r.appointmentId)).size, data.reviews.length, 'one review per visit');
});

test('sample data has no double bookings', () => {
  const data = loadData(NOW);
  const active = data.appointments.filter((a) => a.status === 'Booked');
  assert.equal(new Set(active.map((a) => a.slotId)).size, active.length);
});


test('receptionist can sign in, book for a patient and cancel with visible audit details', () => {
  const data = loadData(NOW);
  const signedIn = loginReceptionist(data, 'rec-001');
  assert.equal(signedIn.ok, true);
  const actor = signedIn.session;
  assert.equal(canAccessPage('receptionist', 'receptionist'), true);
  const slot = freeSlot('d3', day(6));
  const booked = bookAppointment({ slotId: slot.slotId, patientId: 'p2', reason: 'Front desk booking', actor }, NOW);
  assert.equal(booked.ok, true);
  assert.equal(booked.appointment.createdByRole, 'receptionist');
  assert.equal(booked.appointment.createdById, 'rec1');
  const cancelled = cancelAppointment({ appointmentId: booked.appointment.appointmentId, actor }, NOW);
  assert.equal(cancelled.ok, true);
  const saved = loadData(NOW).appointments.find((a) => a.appointmentId === booked.appointment.appointmentId);
  assert.equal(saved.status, 'Cancelled');
  assert.equal(saved.cancelledByRole, 'receptionist');
  assert.equal(saved.cancelledById, 'rec1');
  assert.equal(isSlotBooked(loadData(NOW), slot.slotId), false);
});
test('patients cannot access receptionist desk or cancel another patient appointment', () => {
  assert.equal(canAccessPage('patient', 'receptionist'), false);
  const slot = freeSlot('d4', day(7));
  const booked = bookAppointment({ slotId: slot.slotId, patientId: 'p1', reason: 'Own booking', actor: patient('p1') }, NOW);
  assert.equal(cancelAppointment({ appointmentId: booked.appointment.appointmentId, actor: patient('p2') }, NOW).code, 'UNAUTHORIZED');
});
