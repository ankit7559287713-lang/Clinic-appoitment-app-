import { transact, ok, fail, newId } from './storage.js';
import { validatePatientRegistration, hasErrors } from './validators.js';

export const normalizePhone = (value = '') => String(value).replace(/\D/g, '');
export const normalizeEmail = (value = '') => String(value).trim().toLowerCase();

export function findPatientDuplicate(data, { phone, email = '' }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  return data.patients.find((patient) =>
    normalizePhone(patient.phone) === normalizedPhone ||
    (normalizedEmail && normalizeEmail(patient.email) === normalizedEmail),
  ) || null;
}

function patientFrom(input, patientId) {
  return {
    patientId,
    name: String(input.name).trim(),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    age: Number(input.age),
    gender: String(input.gender).trim(),
    address: String(input.address).trim(),
  };
}

export function registerPatient(input, now = new Date()) {
  const errors = validatePatientRegistration(input);
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please correct the patient details.', { errors });
  return transact((data) => {
    const duplicate = findPatientDuplicate(data, input);
    if (duplicate) return fail('PATIENT_EXISTS', 'A patient with that mobile number or email already exists.', { patient: duplicate });
    const patient = patientFrom(input, newId('p'));
    data.patients.push(patient);
    return ok({
      patient,
      session: { role: 'patient', patientId: patient.patientId },
      registeredAt: now.toISOString(),
    });
  });
}
