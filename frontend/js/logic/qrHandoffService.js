import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';
import { validatePatientRegistration, hasErrors } from './validators.js';
import { findPatientDuplicate, normalizeEmail, normalizePhone } from './patientService.js';

export const HANDOFF_PREFIX = 'clinicbook:patient-registration:v1:';
export const MAX_HANDOFF_BYTES = 1800;
const MAX_HANDOFF_FILE_BYTES = 8192;
const MAX_HANDOFF_AGE_MS = 48 * 60 * 60 * 1000;

const bytesOf = (value) => new TextEncoder().encode(value).length;

export function createPatientHandoff(input, now = new Date()) {
  const errors = validatePatientRegistration(input);
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please correct the patient details.', { errors });
  const record = {
    version: 1,
    nonce: newId('handoff'),
    createdAt: now.toISOString(),
    name: String(input.name).trim(),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    age: Number(input.age),
    gender: String(input.gender).trim(),
    address: String(input.address).trim(),
  };
  const payload = HANDOFF_PREFIX + encodeURIComponent(JSON.stringify(record));
  return ok({ payload, record, qrReady: bytesOf(payload) <= MAX_HANDOFF_BYTES });
}

export function parsePatientHandoff(value, now = new Date()) {
  let payload = String(value || '').trim();
  let fromFile = false;
  if (payload.startsWith('{')) {
    if (bytesOf(payload) > MAX_HANDOFF_FILE_BYTES) {
      return fail('INVALID_HANDOFF', 'The handoff file is too large to import.');
    }
    try {
      const file = JSON.parse(payload);
      if (file.type === 'clinicbook-patient-handoff' && typeof file.payload === 'string') {
        payload = file.payload;
        fromFile = true;
      }
    } catch {
      return fail('INVALID_HANDOFF', 'The handoff file is not valid JSON.');
    }
  }
  if (!payload.startsWith(HANDOFF_PREFIX) ||
      bytesOf(payload) > (fromFile ? MAX_HANDOFF_FILE_BYTES : MAX_HANDOFF_BYTES)) {
    return fail('INVALID_HANDOFF', 'This is not a supported ClinicBook patient handoff.');
  }

  let record;
  try {
    record = JSON.parse(decodeURIComponent(payload.slice(HANDOFF_PREFIX.length)));
  } catch {
    return fail('INVALID_HANDOFF', 'The handoff payload is malformed.');
  }
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      record.version !== 1 || typeof record.nonce !== 'string' ||
      !/^[a-z0-9-]{8,80}$/i.test(record.nonce) ||
      !Number.isFinite(Date.parse(record.createdAt))) {
    return fail('INVALID_HANDOFF', 'The handoff payload is missing required fields.');
  }
  const age = now.getTime() - Date.parse(record.createdAt);
  if (age < -5 * 60 * 1000 || age > MAX_HANDOFF_AGE_MS) {
    return fail('HANDOFF_EXPIRED', 'This handoff has expired. Ask the patient to generate a new one.');
  }
  const patientInput = {
    name: record.name,
    phone: record.phone,
    email: record.email,
    age: record.age,
    gender: record.gender,
    address: record.address,
  };
  const errors = validatePatientRegistration(patientInput);
  if (hasErrors(errors)) return fail('INVALID_HANDOFF', 'The handoff contains invalid patient details.', { errors });
  return ok({ patient: patientInput, nonce: record.nonce, payload });
}

export function importPatientHandoff({ payload, actor }, now = new Date()) {
  if (!can(actor, 'patientImport')) return fail('UNAUTHORIZED', 'Only receptionists can import patient handoffs.');
  const parsed = parsePatientHandoff(payload, now);
  if (!parsed.ok) return parsed;
  return transact((data) => {
    data.importedHandoffNonces ||= [];
    if (data.importedHandoffNonces.some((entry) => entry.nonce === parsed.nonce)) {
      return fail('HANDOFF_ALREADY_IMPORTED', 'This handoff has already been imported.');
    }
    const duplicate = findPatientDuplicate(data, parsed.patient);
    if (duplicate) return fail('PATIENT_EXISTS', 'A patient with that mobile number or email already exists. Select the existing patient instead.', { patient: duplicate });
    const patient = {
      patientId: newId('p'),
      name: String(parsed.patient.name).trim(),
      phone: normalizePhone(parsed.patient.phone),
      email: normalizeEmail(parsed.patient.email),
      age: Number(parsed.patient.age),
      gender: String(parsed.patient.gender).trim(),
      address: String(parsed.patient.address).trim(),
      importedAt: now.toISOString(),
    };
    data.patients.push(patient);
    data.importedHandoffNonces.push({ nonce: parsed.nonce, importedAt: now.toISOString() });
    return ok({ patient });
  });
}

export function handoffFileContents(payload) {
  return JSON.stringify({ type: 'clinicbook-patient-handoff', payload });
}
