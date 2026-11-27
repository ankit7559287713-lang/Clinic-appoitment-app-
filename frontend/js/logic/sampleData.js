// Fictional sample data, generated relative to "today" so the demo always has
// past, today, full, empty, cancelled and overlapping scenarios.
import { toISODate, addDays, startOfDay, timeToMinutes, minutesToTime, toDateTime } from './dateUtils.js';

export const DATA_VERSION = 6;

export function buildSampleData(now = new Date()) {
  const today = startOfDay(now);

  const doctors = [
    { doctorId: 'd1', staffId: 'DOC-101', name: 'Dr. Ananya Rao', specialty: 'General Physician', experience: 12, room: 'Room 101', status: 'active', bio: 'Everyday care, annual check-ups and long-term condition reviews.', qualification: 'MBBS, MD (General Medicine)', expertise: ['Preventive care', 'Diabetes management'], conditionsTreated: ['Fever', 'Hypertension', 'Diabetes'], consultationFee: 600, consultationMode: 'In-person · 15 minutes' },
    { doctorId: 'd2', staffId: 'DOC-204', name: 'Dr. Marcus Chen', specialty: 'Cardiologist', experience: 15, room: 'Room 204', status: 'active', bio: 'Heart health, blood pressure management and ECG follow-ups.', qualification: 'MBBS, DM (Cardiology)', expertise: ['ECG review', 'Heart health'], conditionsTreated: ['Hypertension', 'Palpitations', 'Chest discomfort'], consultationFee: 900, consultationMode: 'In-person · 15 minutes' },
    { doctorId: 'd3', staffId: 'DOC-112', name: 'Dr. Sofia Alvarez', specialty: 'Dermatologist', experience: 8, room: 'Room 112', status: 'active', bio: 'Skin, hair and nail concerns for all ages.', qualification: 'MBBS, MD (Dermatology)', expertise: ['Clinical dermatology', 'Skin care'], conditionsTreated: ['Acne', 'Eczema', 'Rashes'], consultationFee: 700, consultationMode: 'In-person · 15 minutes' },
    { doctorId: 'd4', staffId: 'DOC-007', name: 'Dr. Kwame Mensah', specialty: 'Pediatrician', experience: 10, room: 'Room 007', status: 'active', bio: 'Child wellness visits, vaccinations and growth checks.', qualification: 'MBBS, MD (Pediatrics)', expertise: ['Child wellness', 'Vaccinations'], conditionsTreated: ['Common infections', 'Growth concerns'], consultationFee: 650, consultationMode: 'In-person · 15 minutes' },
    { doctorId: 'd5', staffId: 'DOC-310', name: 'Dr. Priya Nair', specialty: 'Orthopedic Surgeon', experience: 14, room: 'Room 310', status: 'active', bio: 'Joint pain, sports injuries and bone health.', qualification: 'MBBS, MS (Orthopaedics)', expertise: ['Sports injuries', 'Joint care'], conditionsTreated: ['Knee pain', 'Sprains', 'Joint stiffness'], consultationFee: 800, consultationMode: 'In-person · 15 minutes' },
    { doctorId: 'd6', staffId: 'DOC-215', name: "Dr. Liam O'Connor", specialty: 'ENT Specialist', experience: 9, room: 'Room 215', status: 'on-leave', bio: 'Ear, nose and throat care. Currently on leave.', qualification: 'MBBS, MS (ENT)', expertise: ['Ear and sinus care'], conditionsTreated: ['Sinus pain', 'Ear infection'], consultationFee: 700, consultationMode: 'In-person · 15 minutes' },
  ];

  const patients = [
    { patientId: 'p1', name: 'Aarav Sharma', phone: '9876501001', email: 'aarav.sharma@example.in', age: 34, gender: 'Male', address: 'Demo address 1, ClinicBook' },
    { patientId: 'p2', name: 'Nisha Iyer', phone: '9876501002', email: 'nisha.iyer@example.in', age: 29, gender: 'Female', address: 'Demo address 2, ClinicBook' },
    { patientId: 'p3', name: 'Rahul Verma', phone: '9876501003', email: 'rahul.verma@example.in', age: 42, gender: 'Male', address: 'Demo address 3, ClinicBook' },
    { patientId: 'p4', name: 'Fatima Khan', phone: '9876501004', email: 'fatima.khan@example.in', age: 36, gender: 'Female', address: 'Demo address 4, ClinicBook' },
    { patientId: 'p5', name: 'Arjun Patel', phone: '9876501005', email: 'arjun.patel@example.in', age: 31, gender: 'Male', address: 'Demo address 5, ClinicBook' },
    { patientId: 'p6', name: 'Kavya Menon', phone: '9876501006', email: 'kavya.menon@example.in', age: 27, gender: 'Female', address: 'Demo address 6, ClinicBook' },
  ];

  const schedules = {
    d1: { duration: 30, times: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'] },
    d2: { duration: 30, times: ['10:00', '10:30', '11:00', '11:30', '15:00', '15:30'] },
    d3: { duration: 30, times: ['09:00', '09:30', '10:00', '10:30', '16:00', '16:30'] },
    d4: { duration: 30, times: ['08:30', '09:00', '09:30', '10:00', '10:30', '13:00', '13:30', '14:00'] },
    d5: { duration: 30, times: ['11:00', '12:00', '14:00', '15:00', '16:00'] },
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
          consultationEndTime: minutesToTime(timeToMinutes(t) + 15),
          emergencyBufferStartTime: minutesToTime(timeToMinutes(t) + 15),
          emergencyBufferEndTime: minutesToTime(timeToMinutes(t) + s.duration),
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
      endTime: slot.consultationEndTime,
      blockEndTime: slot.endTime,
      consultationEndTime: slot.consultationEndTime,
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

  return {
    version: DATA_VERSION,
    generatedAt: now.toISOString(),
    doctors,
    patients,
    receptionists: [{ receptionistId: 'rec1', staffId: 'REC-001', name: 'Reception Desk' }],
    slots,
    appointments,
    emergencyRequests: [],
    queueEntries: [],
    consultations: [
      {
        consultationId: 'c-demo-001', appointmentId: 'a-001', encounterId: 'a-001',
        encounterType: 'Appointment', patientId: 'p1', doctorId: 'd1',
        chiefComplaint: 'Routine annual check-up', diagnosis: 'Routine wellness review (fictional demo)',
        symptoms: 'No acute concerns noted in this fictional sample.',
        treatmentPlan: 'Routine follow-up discussion at the next visit.',
        notes: 'Fictional sample consultation record. Not clinical advice.',
        referralRequired: false, referralDoctor: '', referralReason: '', referralInstructions: '',
        createdAt: addDays(today, -3).toISOString(), updatedAt: null,
      },
      {
        consultationId: 'c-demo-002', appointmentId: 'a-002', encounterId: 'a-002',
        encounterType: 'Appointment', patientId: 'p2', doctorId: 'd2',
        chiefComplaint: 'Follow-up after ECG', diagnosis: 'Follow-up evaluation (fictional demo)',
        symptoms: 'Demo observation only; no real patient information.',
        treatmentPlan: 'Review at the next scheduled visit.',
        notes: 'Fictional sample consultation record. Not clinical advice.',
        referralRequired: true, referralDoctor: 'Demo specialist', referralReason: 'Example referral for UI testing.',
        referralInstructions: 'Fictional demo instruction.',
        createdAt: addDays(today, -3).toISOString(), updatedAt: null,
      },
      {
        consultationId: 'c-demo-003', appointmentId: 'a-003', encounterId: 'a-003',
        encounterType: 'Appointment', patientId: 'p3', doctorId: 'd3',
        chiefComplaint: 'Skin concern follow-up', diagnosis: 'Demo skin review (fictional)',
        symptoms: 'Fictional placeholder observation.',
        treatmentPlan: 'Example follow-up plan for interface testing.',
        notes: 'Fictional sample consultation record. Not clinical advice.',
        referralRequired: false, referralDoctor: '', referralReason: '', referralInstructions: '',
        createdAt: addDays(today, -2).toISOString(), updatedAt: null,
      },
    ],
    prescriptions: [
      {
        prescriptionId: 'rx-demo-001', consultationId: 'c-demo-001', appointmentId: 'a-001',
        encounterId: 'a-001', patientId: 'p1', doctorId: 'd1', medicineName: 'Demo medicine A',
        dosage: '1 sample unit', frequency: 'Once daily', duration: '3 sample days',
        instructions: 'Fictional placeholder; not for use.',
        createdAt: addDays(today, -3).toISOString(), updatedAt: null,
      },
      {
        prescriptionId: 'rx-demo-002', consultationId: 'c-demo-002', appointmentId: 'a-002',
        encounterId: 'a-002', patientId: 'p2', doctorId: 'd2', medicineName: 'Demo medicine B',
        dosage: '1 sample unit', frequency: 'As needed (demo)', duration: '1 sample day',
        instructions: 'Fictional placeholder; not for use.',
        createdAt: addDays(today, -3).toISOString(), updatedAt: null,
      },
    ],
  };
}
