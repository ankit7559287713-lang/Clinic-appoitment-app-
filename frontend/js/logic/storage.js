// Versioned LocalStorage persistence. DOM-free: tests inject a memory backend.
import { buildSampleData, DATA_VERSION } from './sampleData.js';
import { minutesToTime, timeToMinutes } from './dateUtils.js';

export const DATA_KEY = 'clinicbook.data';
export { DATA_VERSION };

export class StorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageError';
    this.code = 'STORAGE_ERROR';
    this.cause = cause;
  }
}

export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

let backend = null;

function getBackend() {
  if (!backend) {
    backend = typeof window !== 'undefined' && window.localStorage ? window.localStorage : createMemoryBackend();
  }
  return backend;
}

export function setBackend(b) {
  backend = b;
}

export function saveData(data) {
  try {
    getBackend().setItem(DATA_KEY, JSON.stringify({ ...data, version: DATA_VERSION, savedAt: new Date().toISOString() }));
  } catch (err) {
    throw new StorageError('Your changes could not be saved. Browser storage may be full or blocked.', err);
  }
}

export function resetData(now = new Date()) {
  const data = buildSampleData(now);
  saveData(data);
  return data;
}

function migrateData(data) {
  const version = Number(data.version || 0);
  if (version > DATA_VERSION) {
    throw new StorageError(`Saved clinic data version ${version} is newer than this app supports.`);
  }
  if (!Array.isArray(data.doctors) || !Array.isArray(data.patients) ||
      !Array.isArray(data.slots) || !Array.isArray(data.appointments)) {
    throw new StorageError('Saved clinic data is missing required records and cannot be migrated safely.');
  }
  if (version === DATA_VERSION) return { data, changed: false };

  data.receptionists ||= [{ receptionistId: 'rec1', staffId: 'REC-001', name: 'Reception Desk' }];
  data.emergencyRequests ||= [];
  data.queueEntries ||= [];
  data.consultations ||= [];
  data.prescriptions ||= [];

  const demoPhones = {
    p1: '9876501001', p2: '9876501002', p3: '9876501003',
    p4: '9876501004', p5: '9876501005', p6: '9876501006',
  };
  data.patients.forEach((patient) => {
    const priorDemoPhone = `555010200${Number(patient.patientId?.slice(1))}`;
    if (demoPhones[patient.patientId] && String(patient.phone).replace(/\D/g, '') === priorDemoPhone) {
      patient.phone = demoPhones[patient.patientId];
    }
  });

  data.doctors.forEach((doctor) => {
    doctor.qualification ||= 'Qualification not provided';
    doctor.expertise ||= [];
    doctor.conditionsTreated ||= [];
    doctor.consultationFee ??= null;
    doctor.consultationMode ||= 'In-person · 15 minutes';
  });

  data.slots.forEach((slot) => {
    const duration = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
    if (duration !== 30) {
      slot.legacyBlock = true;
      return;
    }
    slot.legacyBlock = false;
    slot.consultationEndTime ||= minutesToTime(timeToMinutes(slot.startTime) + 15);
    slot.emergencyBufferStartTime ||= slot.consultationEndTime;
    slot.emergencyBufferEndTime ||= slot.endTime;
  });

  data.appointments.forEach((appointment) => {
    appointment.checkedInAt ??= null;
    appointment.consultationStatus ||= appointment.status === 'Completed'
      ? 'Completed'
      : appointment.status === 'Cancelled' ? 'Cancelled' : 'Scheduled';
  });

  if (version < 5) {
    data.patients.forEach((patient) => {
      patient.age ??= null;
      patient.gender ??= '';
      patient.address ??= '';
    });
    data.emergencyReservations ||= [];
    data.importedHandoffNonces ||= [];
    data.emergencyRequests.forEach((request) => {
      request.statusHistory ||= [];
      if (request.status === 'Pending') {
        request.status = 'Pending Verification';
        request.statusHistory.push({ status: 'Pending Verification', at: new Date().toISOString(), actorRole: 'migration' });
      } else if (request.status === 'Accepted') {
        request.legacyDecision = true;
        request.legacyStatus = 'Accepted';
        request.status = 'Legacy Accepted';
        request.statusHistory.push({ status: 'Legacy Accepted', at: new Date().toISOString(), actorRole: 'migration' });
      } else if (request.status === 'Rejected') {
        request.legacyDecision = true;
        request.legacyStatus = 'Rejected';
      }
    });
    data.consultations.forEach((consultation) => {
      consultation.encounterId ||= consultation.appointmentId || null;
      consultation.encounterType ||= consultation.appointmentId ? 'Appointment' : 'Legacy';
      consultation.chiefComplaint ??= '';
      consultation.diagnosis ??= '';
      consultation.symptoms ??= '';
      consultation.treatmentPlan ??= '';
      consultation.referralRequired ??= false;
      consultation.referralDoctor ??= '';
      consultation.referralReason ??= '';
      consultation.referralInstructions ??= '';
    });
    data.prescriptions.forEach((prescription) => {
      const consultation = data.consultations.find((entry) =>
        entry.appointmentId && entry.appointmentId === prescription.appointmentId &&
        entry.patientId === prescription.patientId && entry.doctorId === prescription.doctorId,
      );
      if (consultation) {
        prescription.consultationId ||= consultation.consultationId;
        prescription.encounterId ||= consultation.encounterId;
      }
    });
    data.queueEntries.forEach((entry) => {
      entry.queueNumber ??= null;
      entry.referralReason ??= '';
      entry.statusHistory ||= [];
    });
  }
  if (version < 6) {
    data.emergencyRequests.forEach((request) => {
      if (request.status === 'Pending' || request.status === 'Pending Verification') {
        request.status = 'pending_approval';
      } else if (request.status === 'Rejected') {
        request.status = 'rejected';
      }
    });
  }
  data.version = DATA_VERSION;
  return { data, changed: true };
}

/** Always re-reads storage, so callers see the latest state (including other tabs). */
export function loadData(now = new Date()) {
  let raw;
  try {
    raw = getBackend().getItem(DATA_KEY);
  } catch (err) {
    throw new StorageError('Clinic data could not be read from browser storage.', err);
  }
  if (!raw) return resetData(now);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new StorageError('Saved clinic data is corrupted.', err);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StorageError('Saved clinic data has an invalid format.');
  }
  const migrated = migrateData(parsed);
  if (migrated.changed) saveData(migrated.data);
  return migrated.data;
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const ok = (extra = {}) => ({ ok: true, ...extra });
export const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

/**
 * Load → run mutation → save, synchronously. The mutation returns ok()/fail();
 * data is only written when it succeeds.
 */
export function transact(mutate) {
  let data;
  try {
    data = loadData();
  } catch (err) {
    return fail('STORAGE_ERROR', err.message);
  }
  const result = mutate(data);
  if (result.ok) {
    try {
      saveData(data);
    } catch (err) {
      return fail('STORAGE_ERROR', err.message);
    }
  }
  return result;
}
