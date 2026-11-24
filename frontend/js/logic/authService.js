// Demonstration login. There are no passwords: a patient is recognised by their
// registered phone number and a doctor by their staff ID. This is NOT security.
import { ok, fail } from './storage.js';

const digitsOf = (v = '') => String(v).replace(/\D/g, '');

export function loginPatient(data, phone = '') {
  const digits = digitsOf(phone);
  if (!String(phone).trim()) return fail('INVALID_INPUT', 'Enter your registered phone number.');
  if (digits.length < 10 || digits.length > 15) return fail('INVALID_INPUT', 'Phone must have 10–15 digits, e.g. 555-010-2001.');
  const patient = data.patients.find((p) => digitsOf(p.phone) === digits);
  if (!patient) return fail('NOT_FOUND', 'We couldn’t find a patient with that number. Try one of the demo accounts below.');
  return ok({ patient, session: { role: 'patient', patientId: patient.patientId } });
}

export function loginDoctor(data, staffId = '') {
  const id = String(staffId).trim().toUpperCase().replace(/\s+/g, '');
  if (!id) return fail('INVALID_INPUT', 'Enter your staff ID.');
  if (!/^DOC-?\d{3}$/.test(id)) return fail('INVALID_INPUT', 'Staff IDs look like DOC-101.');
  const normal = id.includes('-') ? id : id.replace('DOC', 'DOC-');
  const doctor = data.doctors.find((d) => d.staffId === normal);
  if (!doctor) return fail('NOT_FOUND', 'We couldn’t find a doctor with that staff ID. Try one of the demo accounts below.');
  return ok({ doctor, session: { role: 'doctor', doctorId: doctor.doctorId } });
}

export function loginReceptionist(data, staffId = '') {
  const id = String(staffId).trim().toUpperCase().replace(/\s+/g, '');
  if (!id) return fail('INVALID_INPUT', 'Enter your receptionist staff ID.');
  const receptionist = (data.receptionists || []).find((r) => r.staffId === id);
  if (!receptionist) return fail('NOT_FOUND', 'Receptionist not found. Use the demo account REC-001.');
  return ok({ receptionist, session: { role: 'receptionist', receptionistId: receptionist.receptionistId } });
}
