import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';
import { validateDoctor, hasErrors } from './validators.js';

function cleanDoctor(input, existing = {}) {
  return {
    ...existing,
    staffId: String(input.staffId).trim().toUpperCase(),
    name: String(input.name).trim(),
    specialty: String(input.specialty).trim(),
    experience: Number(input.experience),
    room: String(input.room).trim(),
    qualification: String(input.qualification).trim(),
    bio: String(input.bio).trim(),
    expertise: Array.isArray(input.expertise) ? input.expertise : existing.expertise || [],
    conditionsTreated: Array.isArray(input.conditionsTreated) ? input.conditionsTreated : existing.conditionsTreated || [],
    consultationFee: input.consultationFee === '' ? null : Number(input.consultationFee),
    consultationMode: String(input.consultationMode || existing.consultationMode || 'In-person · 15 minutes').trim(),
  };
}

export function addDoctor({ doctor: input, actor }) {
  if (!can(actor, 'doctorManage')) return fail('UNAUTHORIZED', 'Only receptionists can add doctors.');
  const errors = validateDoctor(input);
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please correct the doctor details.', { errors });
  return transact((data) => {
    const staffId = String(input.staffId).trim().toUpperCase();
    if (data.doctors.some((doctor) => doctor.staffId.toUpperCase() === staffId)) {
      return fail('DUPLICATE_STAFF_ID', 'That doctor staff ID is already in use.');
    }
    const doctor = {
      ...cleanDoctor(input),
      doctorId: newId('d'),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    data.doctors.push(doctor);
    return ok({ doctor });
  });
}

export function updateDoctor({ doctorId, doctor: input, actor }) {
  if (!can(actor, 'doctorManage')) return fail('UNAUTHORIZED', 'Only receptionists can edit doctors.');
  const errors = validateDoctor(input);
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please correct the doctor details.', { errors });
  return transact((data) => {
    const existing = data.doctors.find((doctor) => doctor.doctorId === doctorId);
    if (!existing) return fail('DOCTOR_NOT_FOUND', 'Doctor not found.');
    const staffId = String(input.staffId).trim().toUpperCase();
    if (data.doctors.some((doctor) => doctor.doctorId !== doctorId && doctor.staffId.toUpperCase() === staffId)) {
      return fail('DUPLICATE_STAFF_ID', 'That doctor staff ID is already in use.');
    }
    Object.assign(existing, cleanDoctor(input, existing), { updatedAt: new Date().toISOString() });
    return ok({ doctor: existing });
  });
}

export function setDoctorActive({ doctorId, active, actor }, now = new Date()) {
  if (!can(actor, 'doctorManage')) return fail('UNAUTHORIZED', 'Only receptionists can change doctor status.');
  return transact((data) => {
    const doctor = data.doctors.find((entry) => entry.doctorId === doctorId);
    if (!doctor) return fail('DOCTOR_NOT_FOUND', 'Doctor not found.');
    doctor.status = active ? 'active' : 'inactive';
    doctor.statusChangedAt = now.toISOString();
    return ok({ doctor });
  });
}
