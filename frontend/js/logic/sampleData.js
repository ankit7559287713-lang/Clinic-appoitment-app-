// Fictional sample data, generated relative to "today" so the demo always has
// past, today, full, empty, cancelled and overlapping scenarios.
import { toISODate, addDays, startOfDay, timeToMinutes, minutesToTime, toDateTime } from './dateUtils.js';

export const DATA_VERSION = 3;

export function buildSampleData(now = new Date()) {
  const today = startOfDay(now);

  const doctors = [
    { doctorId: 'd1', staffId: 'DOC-101', name: 'Dr. Ananya Rao', specialty: 'General Physician', experience: 12, room: 'Room 101', status: 'active', bio: 'Everyday care, annual check-ups and long-term condition reviews.' },
    { doctorId: 'd2', staffId: 'DOC-204', name: 'Dr. Marcus Chen', specialty: 'Cardiologist', experience: 15, room: 'Room 204', status: 'active', bio: 'Heart health, blood pressure management and ECG follow-ups.' },
    { doctorId: 'd3', staffId: 'DOC-112', name: 'Dr. Sofia Alvarez', specialty: 'Dermatologist', experience: 8, room: 'Room 112', status: 'active', bio: 'Skin, hair and nail concerns for all ages.' },
    { doctorId: 'd4', staffId: 'DOC-007', name: 'Dr. Kwame Mensah', specialty: 'Pediatrician', experience: 10, room: 'Room 007', status: 'active', bio: 'Child wellness visits, vaccinations and growth checks.' },
    { doctorId: 'd5', staffId: 'DOC-310', name: 'Dr. Priya Nair', specialty: 'Orthopedic Surgeon', experience: 14, room: 'Room 310', status: 'active', bio: 'Joint pain, sports injuries and bone health.' },
    { doctorId: 'd6', staffId: 'DOC-215', name: "Dr. Liam O'Connor", specialty: 'ENT Specialist', experience: 9, room: 'Room 215', status: 'on-leave', bio: 'Ear, nose and throat care. Currently on leave.' },
  ];

  const patients = [
    { patientId: 'p1', name: 'Aarav Sharma', phone: '555-010-2001', email: 'aarav@example.com' },
    { patientId: 'p2', name: 'Emily Johnson', phone: '555-010-2002', email: 'emily@example.com' },
    { patientId: 'p3', name: 'Rahul Verma', phone: '555-010-2003', email: '' },
    { patientId: 'p4', name: 'Fatima Khan', phone: '555-010-2004', email: 'fatima@example.com' },
    { patientId: 'p5', name: 'Diego Morales', phone: '555-010-2005', email: '' },
    { patientId: 'p6', name: 'Mei Lin', phone: '555-010-2006', email: 'mei@example.com' },
  ];

  const schedules = {
    d1: { duration: 30, times: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'] },
    d2: { duration: 45, times: ['10:00', '10:45', '11:30', '12:15', '15:00', '15:45'] },
    d3: { duration: 20, times: ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '16:00', '16:20', '16:40'] },
    d4: { duration: 30, times: ['08:30', '09:00', '09:30', '10:00', '10:30', '13:00', '13:30', '14:00'] },
    d5: { duration: 60, times: ['11:00', '12:00', '14:00', '15:00', '16:00'] },
  };
  // Empty days (no slots published) for some doctors.
  const offDays = { d3: [2], d5: [3, 4] };

  const slots = [];
  for (let offset = -3; offset <= 13; offset++) {
    const date = toISODate(addDays(today, offset));
    for (const [doctorId, s] of Object.entries(schedules)) {
      if (offDays[doctorId]?.includes(offset)) continue;
      for (const t of s.times) {
        slots.push({
          slotId: `s-${doctorId}-${date}-${t.replace(':', '')}`,
          doctorId,
          date,
          startTime: t,
          endTime: minutesToTime(timeToMinutes(t) + s.duration),
        });
      }
    }
  }

  const appointments = [];
  let n = 0;
  const book = (doctorId, offset, time, patientId, status, reason) => {
    const date = toISODate(addDays(today, offset));
    const slot = slots.find((s) => s.doctorId === doctorId && s.date === date && s.startTime === time);
    if (!slot) return;
    const start = toDateTime(slot.date, slot.startTime);
    appointments.push({
      appointmentId: `a-${String(++n).padStart(3, '0')}`,
      slotId: slot.slotId,
      doctorId,
      patientId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      reason,
      status,
      createdAt: addDays(today, Math.min(offset, 0) - 3).toISOString(),
      cancelledAt: status === 'Cancelled' ? addDays(today, Math.min(offset, 0) - 1).toISOString() : null,
      completedAt: status === 'Completed' ? start.toISOString() : null,
    });
  };

  // Past
  book('d1', -3, '09:30', 'p1', 'Completed', 'Annual health check-up');
  book('d2', -3, '10:45', 'p2', 'Completed', 'Follow-up after ECG');
  book('d3', -2, '09:20', 'p3', 'Completed', 'Skin rash on forearm');
  book('d4', -2, '13:00', 'p4', 'Cancelled', "Child's routine vaccination");
  book('d5', -1, '11:00', 'p5', 'Completed', 'Knee pain after running');
  book('d1', -1, '14:30', 'p6', 'Booked', 'Persistent dry cough');
  book('d1', -1, '15:00', 'p1', 'Cancelled', 'Discuss blood test results');
  // Today
  book('d1', 0, '09:00', 'p2', 'Booked', 'Fever and sore throat');
  book('d2', 0, '11:30', 'p1', 'Booked', 'Blood pressure review');
  book('d3', 0, '16:00', 'p4', 'Booked', 'Acne treatment follow-up');
  book('d4', 0, '10:00', 'p3', 'Booked', "Daughter's booster vaccination");
  book('d5', 0, '15:00', 'p6', 'Booked', 'Shoulder stiffness');
  // Tomorrow: Dr. Rao fully booked (full-day scenario)
  const fullReasons = ['General check-up', 'Migraine follow-up', 'Allergy symptoms', 'Medication review', 'Back pain', 'Travel vaccination advice'];
  schedules.d1.times.forEach((t, i) => {
    book('d1', 1, t, patients[i % patients.length].patientId, 'Booked', fullReasons[i % fullReasons.length]);
  });
  // Later this week
  book('d2', 2, '10:00', 'p3', 'Booked', 'Chest tightness during exercise');
  book('d4', 2, '08:30', 'p5', 'Cancelled', 'Ear infection');
  book('d2', 3, '10:00', 'p1', 'Booked', 'Cardiology consultation');
  book('d3', 3, '09:00', 'p2', 'Booked', 'Mole check');
  book('d4', 5, '09:30', 'p4', 'Booked', 'Routine paediatric check-up');
  book('d1', 5, '11:00', 'p5', 'Booked', 'Diabetes review');

  // Older completed visits (before the published slot range), so doctors have review history.
  const archive = (doctorId, daysAgo, time, minutes, patientId, reason) => {
    const date = toISODate(addDays(today, -daysAgo));
    const id = `a-h${String(++n).padStart(3, '0')}`;
    appointments.push({
      appointmentId: id,
      slotId: `s-archive-${id}`,
      doctorId,
      patientId,
      date,
      startTime: time,
      endTime: minutesToTime(timeToMinutes(time) + minutes),
      reason,
      status: 'Completed',
      createdAt: addDays(today, -daysAgo - 4).toISOString(),
      cancelledAt: null,
      completedAt: toDateTime(date, time).toISOString(),
    });
    return id;
  };

  // Patient reviews. Each one belongs to a completed visit by that patient.
  const reviews = [];
  const review = (appointmentId, rating, comment, daysAfter = 1) => {
    const a = appointments.find((x) => x.appointmentId === appointmentId);
    if (!a) return;
    reviews.push({
      reviewId: `r-${String(reviews.length + 1).padStart(3, '0')}`,
      appointmentId,
      doctorId: a.doctorId,
      patientId: a.patientId,
      rating,
      comment,
      createdAt: addDays(toDateTime(a.date, a.endTime), daysAfter).toISOString(),
      updatedAt: null,
    });
  };
  const idOf = (doctorId, patientId, status = 'Completed') =>
    appointments.find((a) => a.doctorId === doctorId && a.patientId === patientId && a.status === status)?.appointmentId;

  review(archive('d1', 30, '10:00', 30, 'p1', 'Seasonal flu'), 5, 'Always listens carefully and never rushes. Felt better within days.');
  review(archive('d1', 21, '11:30', 30, 'p2', 'Routine blood work'), 5, 'Very thorough and kind. Explained every result clearly.', 2);
  review(archive('d1', 12, '14:00', 30, 'p4', 'Headaches'), 4, 'Short wait and practical advice.');
  review(archive('d2', 40, '10:45', 45, 'p1', 'Palpitations'), 5, 'Clear explanation of my ECG. I left feeling reassured.');
  review(archive('d2', 18, '15:00', 45, 'p6', 'Cholesterol review'), 4, 'Professional and knowledgeable, though the visit felt a little rushed.');
  review(idOf('d2', 'p2'), 5, 'Great follow-up — he remembered my history.');
  review(idOf('d3', 'p3'), 5, 'The rash cleared up within a week. Thank you!');
  review(archive('d3', 25, '09:40', 20, 'p6', 'Eczema flare-up'), 4, 'Helpful skincare plan, easy to follow.');
  review(archive('d4', 35, '09:00', 30, 'p4', "Son's check-up"), 5, 'Wonderful with children — my son wasn’t scared at all.');
  review(archive('d4', 16, '13:30', 30, 'p3', "Daughter's ear pain"), 5, 'Patient, gentle and explained everything to my daughter.', 2);
  review(archive('d5', 28, '12:00', 60, 'p2', 'Ankle sprain'), 3, 'Good advice, but I waited about 20 minutes past my slot.');
  review(idOf('d5', 'p5'), 4, 'Clear exercise plan for my knee. Already improving.');
  review(archive('d6', 60, '11:00', 30, 'p6', 'Sinus pain'), 4, 'Knowledgeable and calm. Hope he’s back soon!');

  return {
    version: DATA_VERSION,
    generatedAt: now.toISOString(),
    doctors,
    patients,
    receptionists: [{ receptionistId: 'rec1', staffId: 'REC-001', name: 'Reception Desk' }],
    slots,
    appointments,
    reviews,
  };
}
