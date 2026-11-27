// Demonstration login. There are no passwords: a patient is recognised by their
// registered phone number and a doctor by their staff ID. This is NOT security.
import { ok, fail } from './storage.js';

export function loginPatient(data, phone = '') {
  const identifier = String(phone).trim();
  if (!identifier) return fail('INVALID_INPUT', 'Enter your 10-digit mobile number or email address.');
  const isEmail = identifier.includes('@');
  if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(identifier)) {
    return fail('INVALID_INPUT', 'Enter a valid email address.');
  }
  const normalizedPhone = identifier.replace(/\D/g, '');
  if (!isEmail && (!/^[\d\s()+.-]+$/.test(identifier) || !/^\d{10}$/.test(normalizedPhone))) {
    return fail('INVALID_INPUT', 'Enter exactly 10 digits for an Indian mobile number.');
  }
  const patient = data.patients.find((p) => isEmail
    ? String(p.email || '').trim().toLowerCase() === identifier.toLowerCase()
    : String(p.phone || '').replace(/\D/g, '') === normalizedPhone);
  if (!patient) return fail('NOT_FOUND', 'We couldn’t find a patient with those details. Try one of the demo accounts below.');
  return ok({ patient, session: { role: 'patient', patientId: patient.patientId } });
}

export function loginDoctor(data, staffId = '') {
  const id = String(staffId).trim().toUpperCase().replace(/\s+/g, '');
  if (!id) return fail('INVALID_INPUT', 'Enter your staff ID.');
  if (!/^DOC-?\d{3}$/.test(id)) return fail('INVALID_INPUT', 'Staff IDs look like DOC-101.');
  const normal = id.includes('-') ? id : id.replace('DOC', 'DOC-');
  const doctor = data.doctors.find((d) => d.staffId === normal);
  if (!doctor) return fail('NOT_FOUND', 'We couldn’t find a doctor with that staff ID. Try one of the demo accounts below.');
  if (doctor.status === 'inactive') return fail('DOCTOR_INACTIVE', 'This doctor account is inactive. Contact the receptionist.');
  return ok({ doctor, session: { role: 'doctor', doctorId: doctor.doctorId } });
}

export function loginReceptionist(data, staffId = '') {
  const id = String(staffId).trim().toUpperCase().replace(/\s+/g, '');
  if (!id) return fail('INVALID_INPUT', 'Enter your receptionist staff ID.');
  const receptionist = (data.receptionists || []).find((r) => r.staffId === id);
  if (!receptionist) return fail('NOT_FOUND', 'Receptionist not found. Use the demo account REC-001.');
  return ok({ receptionist, session: { role: 'receptionist', receptionistId: receptionist.receptionistId } });
}
