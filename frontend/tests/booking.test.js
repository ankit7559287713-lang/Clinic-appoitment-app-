import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setBackend, createMemoryBackend, loadData, resetData, DATA_KEY, DATA_VERSION, saveData } from '../js/logic/storage.js';
import { bookAppointment, cancelAppointment, completeAppointment, startConsultation } from '../js/logic/bookingService.js';
import { addSlot, removeSlot, listSlots, isSlotBooked } from '../js/logic/slotService.js';
import { validatePatient, validateSlotInput } from '../js/logic/validators.js';
import { can, canAccessPage } from '../js/logic/roleGuard.js';
import { loginPatient, loginDoctor, loginReceptionist } from '../js/logic/authService.js';
import { requestEmergency, approveEmergencyRequest, rejectEmergencyRequest, listEmergencyRequests, updateEmergencyCase, emergencyBuffers } from '../js/logic/emergencyService.js';
import { patientChart, patientClinicalRecords, saveClinicalRecord } from '../js/logic/consultationService.js';
import { registerPatient } from '../js/logic/patientService.js';
import { addDoctor, setDoctorActive } from '../js/logic/doctorService.js';
import { createPatientHandoff, handoffFileContents, importPatientHandoff, parsePatientHandoff } from '../js/logic/qrHandoffService.js';
import {
  addWalkInToQueue,
  checkInAppointmentByQr,
  parseAppointmentQrPayload,
  patientDetails,
  registerWalkIn,
  searchPatients,
  updateQueueStatus,
  validateAppointmentQr,
} from '../js/logic/receptionService.js';
import { matchesSpecialty, doctorProfileHref } from '../js/logic/doctorDirectory.js';
import { toISODate, addDays, timeToMinutes, minutesToTime } from '../js/logic/dateUtils.js';
import { buildSampleData } from '../js/logic/sampleData.js';
import { getSession, setSession } from '../js/ui/session.js';

const NOW = new Date(2026, 10, 18, 8, 0, 0);
const day = (n) => toISODate(addDays(NOW, n));
const patient = (id) => ({ role: 'patient', patientId: id });
const doctor = (id) => ({ role: 'doctor', doctorId: id });
const receptionist = { role: 'receptionist', receptionistId: 'rec1' };
let backend;

function freeSlot(doctorId, date) {
  return listSlots(loadData(NOW), { doctorId, date }, NOW).find((slot) => slot.status === 'Available' && !slot.isPast);
}

beforeEach(() => {
  backend = createMemoryBackend();
  setBackend(backend);
  resetData(NOW);
});

test('only one of two sequential bookings for the same slot succeeds', () => {
  const slot = freeSlot('d3', day(4));
  const first = bookAppointment({ slotId: slot.slotId, patientId: 'p5', reason: 'Skin check', actor: patient('p5') }, NOW);
  const second = bookAppointment({ slotId: slot.slotId, patientId: 'p6', reason: 'Rash', actor: patient('p6') }, NOW);
  assert.equal(first.ok, true);
  assert.equal(second.code, 'SLOT_TAKEN');
  assert.equal(loadData(NOW).appointments.filter((entry) => entry.slotId === slot.slotId && entry.status === 'Booked').length, 1);
});

test('cancelled bookings retain history and release their slot', () => {
  const slot = freeSlot('d4', day(6));
  const first = bookAppointment({ slotId: slot.slotId, patientId: 'p1', reason: 'Vaccination', actor: patient('p1') }, NOW);
  assert.equal(cancelAppointment({ appointmentId: first.appointment.appointmentId, actor: patient('p1') }, NOW).ok, true);
  assert.equal(isSlotBooked(loadData(NOW), slot.slotId), false);
  assert.equal(bookAppointment({ slotId: slot.slotId, patientId: 'p3', reason: 'Fever', actor: patient('p3') }, NOW).ok, true);
  const history = loadData(NOW).appointments.filter((entry) => entry.slotId === slot.slotId);
  assert.deepEqual(history.map((entry) => entry.status).sort(), ['Booked', 'Cancelled']);
});

test('regular slots are exactly 30 minutes with a protected 15-minute emergency buffer', () => {
  const slot = freeSlot('d1', day(6));
  assert.equal(timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime), 30);
  assert.equal(timeToMinutes(slot.consultationEndTime) - timeToMinutes(slot.startTime), 15);
  assert.equal(slot.emergencyBufferStartTime, slot.consultationEndTime);
  assert.equal(timeToMinutes(slot.emergencyBufferEndTime) - timeToMinutes(slot.emergencyBufferStartTime), 15);
  assert.equal(addSlot({ doctorId: 'd1', date: day(6), startTime: '17:00', duration: 15, actor: doctor('d1') }, NOW).code, 'INVALID_INPUT');
  assert.equal(validateSlotInput({ date: day(1), startTime: '23:30', duration: 30 }, NOW).duration !== undefined, true);
});

test('doctor slots cannot overlap and back-to-back 30-minute blocks are allowed', () => {
  const first = addSlot({ doctorId: 'd1', date: day(6), startTime: '17:00', duration: 30, actor: doctor('d1') }, NOW);
  assert.equal(first.ok, true);
  assert.equal(addSlot({ doctorId: 'd1', date: day(6), startTime: '17:15', duration: 30, actor: doctor('d1') }, NOW).code, 'SLOT_OVERLAP');
  assert.equal(addSlot({ doctorId: 'd1', date: day(6), startTime: '17:30', duration: 30, actor: doctor('d1') }, NOW).ok, true);
});

test('normal booking reserves the whole 30-minute patient block', () => {
  const firstSlot = freeSlot('d1', day(6));
  const first = bookAppointment({ slotId: firstSlot.slotId, patientId: 'p1', reason: 'Check-up', actor: patient('p1') }, NOW);
  assert.equal(first.ok, true);
  const overlappingSlot = addSlot({ doctorId: 'd2', date: day(6), startTime: '09:15', duration: 30, actor: doctor('d2') }, NOW).slot;
  assert.equal(bookAppointment({ slotId: overlappingSlot.slotId, patientId: 'p1', reason: 'Follow-up', actor: patient('p1') }, NOW).code, 'PATIENT_OVERLAP');
});

test('past appointments cannot be booked', () => {
  const past = listSlots(loadData(NOW), { doctorId: 'd5', date: day(-1) }, NOW).find((slot) => slot.status === 'Available');
  assert.equal(bookAppointment({ slotId: past.slotId, patientId: 'p2', reason: 'Too late', actor: patient('p2') }, NOW).code, 'SLOT_IN_PAST');
});

test('a booked slot cannot be removed and a doctor cannot remove another doctor’s slot', () => {
  const booked = listSlots(loadData(NOW), { doctorId: 'd1', date: day(1) }, NOW)[0];
  assert.equal(removeSlot({ slotId: booked.slotId, actor: doctor('d1') }).code, 'SLOT_HAS_BOOKING');
  const free = freeSlot('d1', day(6));
  assert.equal(removeSlot({ slotId: free.slotId, actor: doctor('d2') }).code, 'UNAUTHORIZED');
  assert.equal(removeSlot({ slotId: free.slotId, actor: doctor('d1') }).ok, true);
});

test('validation enforces mobile length, required fields, and 30-minute duration', () => {
  assert.ok(validatePatient({ name: '', phone: '12' }).name);
  assert.ok(validatePatient({ name: 'Ann', phone: '123456789' }).phone);
  assert.ok(validatePatient({ name: 'Ann', phone: '12345678901' }).phone);
  assert.ok(validatePatient({ name: 'Ann', phone: 'abc9876501001' }).phone);
  assert.deepEqual(validatePatient({ name: 'Ann Lee', phone: '9876501001', email: 'ann@example.in' }), {});
  assert.ok(validateSlotInput({ date: day(-1), startTime: '10:00', duration: 30 }, NOW).startTime);
  assert.deepEqual(validateSlotInput({ date: day(1), startTime: '10:00', duration: 30 }, NOW), {});
});

test('role guard preserves role and ownership permissions', () => {
  assert.equal(canAccessPage('patient', 'schedule'), false);
  assert.equal(canAccessPage('doctor', 'schedule'), true);
  assert.equal(canAccessPage('patient', 'receptionist'), false);
  assert.equal(can(patient('p1'), 'book', { patientId: 'p2' }), false);
  assert.equal(can(receptionist, 'book', { patientId: 'p2' }), true);
});

test('patient login accepts exact 10-digit mobile or registered email only', () => {
  const data = loadData(NOW);
  assert.equal(loginPatient(data, '9876501001').session.patientId, 'p1');
  assert.equal(loginPatient(data, '987-650-1003').session.patientId, 'p3');
  assert.equal(loginPatient(data, 'abc9876501001').code, 'INVALID_INPUT');
  assert.equal(loginPatient(data, 'AARAV.SHARMA@EXAMPLE.IN').session.patientId, 'p1');
  assert.equal(loginPatient(data, '919876501001').code, 'INVALID_INPUT');
  assert.equal(loginPatient(data, '987650100').code, 'INVALID_INPUT');
  assert.equal(loginPatient(data, '9876501999').code, 'NOT_FOUND');
});

test('patients can register themselves and duplicate phone or email is rejected', () => {
  const input = {
    name: 'Mira Kapoor', phone: '9876502001', email: 'Mira@example.in',
    age: 28, gender: 'Female', address: '24 Clinic Street',
  };
  const created = registerPatient(input, NOW);
  assert.equal(created.ok, true);
  assert.equal(created.session.patientId, created.patient.patientId);
  assert.equal(loginPatient(loadData(NOW), input.phone).session.patientId, created.patient.patientId);
  assert.equal(loginPatient(loadData(NOW), input.email).session.patientId, created.patient.patientId);
  assert.equal(registerPatient({ ...input, name: 'Another Mira', phone: '9876502001', email: 'another@example.in' }, NOW).code, 'PATIENT_EXISTS');
  assert.equal(registerPatient({ ...input, phone: '9876502002' }, NOW).code, 'PATIENT_EXISTS');
});

test('receptionists manage doctor accounts and inactive doctors cannot sign in', () => {
  const details = {
    staffId: 'DOC-900', name: 'Dr. Mira Shah', specialty: 'General Physician',
    experience: 7, room: 'Room 900', qualification: 'MBBS', bio: '',
    expertise: [], conditionsTreated: [], consultationFee: '',
  };
  assert.equal(addDoctor({ doctor: details, actor: doctor('d1') }).code, 'UNAUTHORIZED');
  const added = addDoctor({ doctor: details, actor: receptionist });
  assert.equal(added.ok, true);
  assert.equal(loginDoctor(loadData(NOW), details.staffId).session.doctorId, added.doctor.doctorId);
  assert.equal(addDoctor({ doctor: details, actor: receptionist }).code, 'DUPLICATE_STAFF_ID');
  assert.equal(setDoctorActive({ doctorId: added.doctor.doctorId, active: false, actor: receptionist }, NOW).ok, true);
  assert.equal(loginDoctor(loadData(NOW), details.staffId).code, 'DOCTOR_INACTIVE');
});

test('doctor and receptionist demo sign-in remain available', () => {
  const data = loadData(NOW);
  assert.equal(loginDoctor(data, ' doc204 ').session.doctorId, 'd2');
  assert.equal(loginReceptionist(data, 'rec-001').session.receptionistId, 'rec1');
  assert.equal(loginReceptionist(data, 'REC-999').code, 'NOT_FOUND');
});

test('session storage reports successful writes and blocked storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    const values = new Map();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
      },
    });
    const session = { role: 'receptionist', receptionistId: 'rec1' };
    assert.equal(setSession(session), true);
    assert.deepEqual(getSession(), session);
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: { setItem() { throw new Error('Storage blocked'); } },
    });
    assert.equal(setSession(session), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});

test('doctor profile links and specialty autocomplete matching are correct', () => {
  assert.equal(doctorProfileHref('d1'), 'book.html?doctor=d1');
  assert.equal(matchesSpecialty({ specialty: 'Cardiologist' }, 'card'), true);
  assert.equal(matchesSpecialty({ specialty: 'Cardiologist' }, 'DERM'), false);
});

test('new sample data contains Indian-format demo mobiles and no rating/review data', () => {
  const data = buildSampleData(NOW);
  assert.ok(data.patients.every((entry) => /^\d{10}$/.test(entry.phone)));
  assert.equal(Object.hasOwn(data, 'reviews'), false);
  assert.ok(data.slots.every((slot) => timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime) === 30));
  assert.ok(data.doctors.every((entry) => entry.qualification && entry.expertise && entry.conditionsTreated));
});

test('patient can request emergency care without creating an appointment', () => {
  const before = loadData(NOW).appointments.length;
  const slot = emergencyBuffers(loadData(NOW), 'd1', NOW)[0];
  const result = requestEmergency({ patientId: 'p1', doctorId: 'd1', slotId: slot.slotId, reason: 'Urgent assessment', actor: patient('p1') }, NOW);
  assert.equal(result.ok, true);
  assert.equal(loadData(NOW).appointments.length, before);
  assert.equal(loadData(NOW).emergencyRequests[0].status, 'pending_approval');
  assert.equal(listEmergencyRequests(loadData(NOW), { doctorId: 'd1' }).length, 0);
  const newPatient = registerPatient({
    name: 'New Patient', phone: '9876502001', email: 'new@example.in',
    age: 30, gender: 'Prefer not to say', address: '24 Clinic Street',
  }, NOW).patient;
  const otherSlot = emergencyBuffers(loadData(NOW), 'd1', NOW).find((candidate) => candidate.slotId !== slot.slotId);
  assert.equal(requestEmergency({ patientId: newPatient.patientId, doctorId: 'd1', slotId: otherSlot.slotId, reason: 'Urgent assessment', actor: patient(newPatient.patientId) }, NOW).ok, true);
  assert.equal(patientChart(loadData(NOW), newPatient.patientId, doctor('d1')).code, 'UNAUTHORIZED');
  assert.equal(requestEmergency({ patientId: 'p1', doctorId: 'd1', slotId: slot.slotId, reason: 'Again', actor: patient('p1') }, NOW).code, 'REQUEST_ALREADY_PENDING');
  assert.equal(requestEmergency({ patientId: 'p2', doctorId: 'd1', reason: 'Not mine', actor: patient('p1') }, NOW).code, 'UNAUTHORIZED');
});

test('receptionist approval creates one confirmed appointment and then exposes the case to its doctor', () => {
  const slot = emergencyBuffers(loadData(NOW), 'd1', NOW)[0];
  const request = requestEmergency({ patientId: 'p6', doctorId: 'd1', slotId: slot.slotId, reason: 'Urgent care', actor: patient('p6') }, NOW).request;
  const appointmentCount = loadData(NOW).appointments.length;
  assert.equal(approveEmergencyRequest({ requestId: request.requestId, actor: doctor('d1') }, NOW).code, 'UNAUTHORIZED');
  const accepted = approveEmergencyRequest({ requestId: request.requestId, actor: receptionist }, NOW);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.buffer.startTime, slot.emergencyBufferStartTime);
  assert.equal(loadData(NOW).appointments.length, appointmentCount + 1);
  assert.equal(accepted.request.status, 'Approved');
  assert.equal(accepted.appointment.emergencyRequestId, request.requestId);
  assert.equal(accepted.appointment.patientId, 'p6');
  assert.equal(accepted.appointment.date, slot.date);
  assert.equal(approveEmergencyRequest({ requestId: request.requestId, actor: receptionist }, NOW).code, 'INVALID_STATUS');
  assert.equal(loadData(NOW).appointments.length, appointmentCount + 1);
  assert.equal(loadData(NOW).appointments.some((entry) =>
    entry.patientId === 'p6' && entry.emergencyRequestId === request.requestId && entry.status === 'Booked',
  ), true);
  assert.equal(listEmergencyRequests(loadData(NOW), { doctorId: 'd1' }).some((entry) => entry.requestId === request.requestId), true);
  assert.equal(patientChart(loadData(NOW), 'p6', doctor('d1')).ok, true);

  const consultation = saveClinicalRecord({
    encounterId: request.requestId, actor: doctor('d1'), notes: 'Emergency assessment recorded.',
  }, NOW);
  assert.equal(consultation.ok, true);
  assert.equal(loadData(NOW).emergencyRequests.find((entry) => entry.requestId === request.requestId).status, 'In Progress');
  assert.equal(updateEmergencyCase({ requestId: request.requestId, status: 'Completed', actor: doctor('d1') }, NOW).ok, true);
  assert.equal(patientClinicalRecords(loadData(NOW), 'p6', patient('p6')).records[0].consultation.notes, 'Emergency assessment recorded.');

  const secondSlot = emergencyBuffers(loadData(NOW), 'd1', NOW).find((candidate) => candidate.slotId !== slot.slotId);
  const second = requestEmergency({ patientId: 'p4', doctorId: 'd1', slotId: secondSlot.slotId, reason: 'Another urgent request', actor: patient('p4') }, NOW).request;
  assert.equal(approveEmergencyRequest({ requestId: second.requestId, actor: receptionist }, NOW).ok, true);
});

test('only receptionists can reject pending emergency requests and rejection is retained', () => {
  const slot = emergencyBuffers(loadData(NOW), 'd1', NOW)[0];
  const request = requestEmergency({ patientId: 'p1', doctorId: 'd1', slotId: slot.slotId, reason: 'Urgent care', actor: patient('p1') }, NOW).request;
  const appointmentCount = loadData(NOW).appointments.length;
  assert.equal(rejectEmergencyRequest({ requestId: request.requestId, actor: doctor('d2') }, NOW).code, 'UNAUTHORIZED');
  assert.equal(rejectEmergencyRequest({ requestId: request.requestId, actor: receptionist }, NOW).ok, true);
  const saved = loadData(NOW).emergencyRequests.find((entry) => entry.requestId === request.requestId);
  assert.equal(saved.status, 'rejected');
  assert.equal(saved.statusHistory.at(-1).status, 'rejected');
  assert.equal(loadData(NOW).appointments.length, appointmentCount);
});

test('patient handoff payload imports demographics once and rejects duplicates and replay', () => {
  const handoff = createPatientHandoff({
    name: 'Mira Kapoor', phone: '9876502001', email: 'mira@example.in',
    age: 28, gender: 'Female', address: '24 Clinic Street',
  }, NOW);
  assert.equal(handoff.ok, true);
  assert.equal(parsePatientHandoff(handoff.payload, NOW).ok, true);
  const imported = importPatientHandoff({ payload: handoff.payload, actor: receptionist }, NOW);
  assert.equal(imported.ok, true);
  assert.equal(imported.patient.phone, '9876502001');
  assert.equal(importPatientHandoff({ payload: handoff.payload, actor: receptionist }, NOW).code, 'HANDOFF_ALREADY_IMPORTED');
  const duplicate = createPatientHandoff({
    name: 'Other Patient', phone: '9876501001', email: 'other@example.in',
    age: 28, gender: 'Female', address: '24 Clinic Street',
  }, NOW);
  assert.equal(importPatientHandoff({ payload: duplicate.payload, actor: receptionist }, NOW).code, 'PATIENT_EXISTS');
});

test('oversized patient handoff can use its JSON file fallback without truncation', () => {
  const handoff = createPatientHandoff({
    name: '山田花子', phone: '9876502010', email: 'hanako@example.in',
    age: 28, gender: 'Female', address: '界'.repeat(240),
  }, NOW);
  assert.equal(handoff.ok, true);
  assert.equal(handoff.qrReady, false);
  assert.equal(parsePatientHandoff(handoff.payload, NOW).code, 'INVALID_HANDOFF');
  const file = handoffFileContents(handoff.payload);
  assert.equal(parsePatientHandoff(file, NOW).ok, true);
  assert.equal(importPatientHandoff({ payload: file, actor: receptionist }, NOW).ok, true);
});

test('only assigned doctor can start, complete, and write clinical records', () => {
  const slot = freeSlot('d1', day(6));
  const booked = bookAppointment({ slotId: slot.slotId, patientId: 'p1', reason: 'Consultation', actor: patient('p1') }, NOW);
  const appointmentId = booked.appointment.appointmentId;
  assert.equal(startConsultation({ appointmentId, actor: doctor('d2') }, NOW).code, 'UNAUTHORIZED');
  assert.equal(startConsultation({ appointmentId, actor: doctor('d1') }, NOW).ok, true);
  const saved = saveClinicalRecord({
    appointmentId,
    actor: doctor('d1'),
    notes: 'Rest and follow up in one week.',
    prescriptions: [{ medicineName: 'Demo medicine', dosage: '1 tablet', frequency: 'Twice daily', duration: '5 days', instructions: 'Take after food.' }],
  }, NOW);
  assert.equal(saved.ok, true);
  assert.equal(saveClinicalRecord({ appointmentId, actor: doctor('d2'), notes: 'Not assigned', prescriptions: [] }, NOW).code, 'UNAUTHORIZED');
  assert.equal(completeAppointment({ appointmentId, actor: doctor('d1') }, NOW).ok, true);
  const ownRecords = patientClinicalRecords(loadData(NOW), 'p1', patient('p1'));
  assert.equal(ownRecords.ok, true);
  const ownRecord = ownRecords.records.find((record) => record.appointment.appointmentId === appointmentId);
  assert.equal(ownRecord.consultation.notes, 'Rest and follow up in one week.');
  assert.equal(ownRecord.prescriptions[0].instructions, 'Take after food.');
  assert.equal(patientClinicalRecords(loadData(NOW), 'p1', patient('p2')).code, 'UNAUTHORIZED');
});

test('clinical records reject duplicate medicines and remain hidden until completed', () => {
  const slot = freeSlot('d2', day(6));
  const appointment = bookAppointment({ slotId: slot.slotId, patientId: 'p3', reason: 'Review', actor: patient('p3') }, NOW).appointment;
  assert.equal(patientClinicalRecords(loadData(NOW), 'p3', patient('p3')).records.some((record) => record.appointment.appointmentId === appointment.appointmentId), false);
  const medication = { medicineName: 'Example', dosage: '1', frequency: 'Daily', duration: '1 day', instructions: 'With water' };
  assert.equal(saveClinicalRecord({ appointmentId: appointment.appointmentId, actor: doctor('d2'), prescriptions: [medication, medication] }, NOW).code, 'INVALID_INPUT');
});

test('doctor completion updates checked-in queue history', () => {
  const appointment = loadData(NOW).appointments.find((entry) =>
    entry.doctorId === 'd1' && entry.date === day(0) && entry.status === 'Booked',
  );
  assert.ok(appointment);
  assert.equal(checkInAppointmentByQr({
    payload: `clinicbook:appointment:${appointment.appointmentId}`,
    actor: receptionist,
  }, NOW).ok, true);
  assert.equal(completeAppointment({ appointmentId: appointment.appointmentId, actor: doctor('d1') }, NOW).ok, true);
  const queueEntry = loadData(NOW).queueEntries.find((entry) => entry.appointmentId === appointment.appointmentId);
  assert.equal(queueEntry.status, 'Completed');
  assert.equal(queueEntry.statusHistory.at(-1).status, 'Completed');
});

test('walk-in registration, duplicate protection, search, details, and queue status updates work', () => {
  const created = registerWalkIn({ name: 'Mira Kapoor', phone: '9876502001', email: 'mira@example.in', doctorId: 'd1', actor: receptionist }, NOW);
  assert.equal(created.ok, true);
  assert.equal(created.queueEntry.entryType, 'WalkIn');
  assert.equal(registerWalkIn({ name: 'Mira Kapoor', phone: '9876502001', actor: receptionist }, NOW).code, 'PATIENT_EXISTS');
  assert.equal(searchPatients(loadData(NOW), 'mira').length, 1);
  assert.equal(patientDetails(loadData(NOW), created.patient.patientId, receptionist).patient.email, 'mira@example.in');
  assert.equal(updateQueueStatus({ queueId: created.queueEntry.queueId, status: 'Consulting', actor: receptionist }, NOW).ok, true);
  assert.equal(updateQueueStatus({ queueId: created.queueEntry.queueId, status: 'Completed', actor: receptionist }, NOW).ok, true);
  assert.equal(addWalkInToQueue({ patientId: created.patient.patientId, actor: receptionist }, NOW).code, 'ALREADY_IN_QUEUE');
});

test('appointment QR payload validation checks identity, same-day status, and duplicate check-in', () => {
  const appointment = loadData(NOW).appointments.find((entry) => entry.date === day(0) && entry.status === 'Booked');
  const payload = `clinicbook:appointment:${appointment.appointmentId}`;
  assert.equal(parseAppointmentQrPayload(payload), appointment.appointmentId);
  assert.equal(parseAppointmentQrPayload('other:payload'), null);
  assert.equal(validateAppointmentQr(payload, loadData(NOW), NOW).ok, true);
  const checkedIn = checkInAppointmentByQr({ payload, actor: receptionist }, NOW);
  assert.equal(checkedIn.ok, true);
  assert.equal(checkedIn.queueEntry.entryType, 'ScheduledCheckIn');
  assert.equal(checkInAppointmentByQr({ payload, actor: receptionist }, NOW).code, 'ALREADY_CHECKED_IN');
  assert.equal(checkInAppointmentByQr({ payload, actor: doctor('d1') }, NOW).code, 'UNAUTHORIZED');
});

test('versioned migration preserves existing appointments and cancellation history', () => {
  const old = buildSampleData(NOW);
  old.version = 3;
  old.patients.find((entry) => entry.patientId === 'p1').phone = '555-010-2001';
  old.reviews = [{ reviewId: 'legacy-review' }];
  const legacySlot = old.slots.find((slot) => slot.doctorId === 'd1' && slot.date === day(6) && slot.startTime === '09:00');
  old.emergencyRequests = [
    { requestId: 'em-pending', patientId: 'p1', doctorId: 'd1', status: 'Pending', createdAt: NOW.toISOString(), slotId: null },
    { requestId: 'em-accepted', patientId: 'p2', doctorId: 'd1', status: 'Accepted', createdAt: NOW.toISOString(), slotId: legacySlot.slotId },
    { requestId: 'em-rejected', patientId: 'p3', doctorId: 'd1', status: 'Rejected', createdAt: NOW.toISOString(), slotId: null },
  ];
  legacySlot.endTime = minutesToTime(timeToMinutes(legacySlot.startTime) + 45);
  const appointmentIds = old.appointments.map((appointment) => appointment.appointmentId);
  const cancelledIds = old.appointments.filter((appointment) => appointment.status === 'Cancelled').map((appointment) => appointment.appointmentId);
  backend.setItem(DATA_KEY, JSON.stringify(old));
  const migrated = loadData(NOW);
  assert.equal(migrated.version, DATA_VERSION);
  assert.deepEqual(migrated.appointments.map((appointment) => appointment.appointmentId), appointmentIds);
  assert.deepEqual(migrated.appointments.filter((appointment) => appointment.status === 'Cancelled').map((appointment) => appointment.appointmentId), cancelledIds);
  assert.equal(migrated.patients.find((entry) => entry.patientId === 'p1').phone, '9876501001');
  assert.equal(migrated.slots.find((slot) => slot.slotId === legacySlot.slotId).legacyBlock, true);
  assert.deepEqual(migrated.emergencyRequests.map((entry) => entry.status), ['pending_approval', 'Legacy Accepted', 'rejected']);
  assert.equal(migrated.emergencyRequests[1].legacyStatus, 'Accepted');
  assert.equal(migrated.emergencyRequests[2].legacyDecision, true);
  assert.deepEqual(migrated.reviews, [{ reviewId: 'legacy-review' }]);
  assert.equal(JSON.parse(backend.getItem(DATA_KEY)).version, DATA_VERSION);
});

test('patient and doctor pages no longer render ratings or review forms', async () => {
  const [appointments, booking, doctors, directoryPage, profilePage] = await Promise.all([
    readFile(new URL('../appointments.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/pages/appointments.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/pages/doctors.js', import.meta.url), 'utf8'),
    readFile(new URL('../doctors.html', import.meta.url), 'utf8'),
    readFile(new URL('../book.html', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(appointments, /reviewModal|starInput|reviewForm/);
  assert.doesNotMatch(booking, /reviewForAppointment|addReview|doctorRating/);
  assert.doesNotMatch(doctors + directoryPage + profilePage, /ratingInline|doctorRating|reviewsTitle|Patient reviews/);
});

test('sample appointments have no duplicate active booking per slot', () => {
  const active = loadData(NOW).appointments.filter((appointment) => appointment.status === 'Booked');
  assert.equal(new Set(active.map((appointment) => appointment.slotId)).size, active.length);
});

test('receptionist assisted booking and cancellation retain actor attribution', () => {
  const slot = freeSlot('d3', day(6));
  const result = bookAppointment({ slotId: slot.slotId, patientId: 'p2', reason: 'Front desk booking', actor: receptionist }, NOW);
  assert.equal(result.appointment.createdByRole, 'receptionist');
  assert.equal(cancelAppointment({ appointmentId: result.appointment.appointmentId, actor: receptionist }, NOW).ok, true);
  const saved = loadData(NOW).appointments.find((entry) => entry.appointmentId === result.appointment.appointmentId);
  assert.equal(saved.cancelledById, 'rec1');
});

test('storage save retains the current version and persistence shape', () => {
  const data = loadData(NOW);
  saveData(data);
  assert.equal(JSON.parse(backend.getItem(DATA_KEY)).version, DATA_VERSION);
});
