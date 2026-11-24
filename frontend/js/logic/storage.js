// Versioned LocalStorage persistence. DOM-free: tests inject a memory backend.
import { buildSampleData, DATA_VERSION } from './sampleData.js';

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
  if (!parsed || parsed.version !== DATA_VERSION || !Array.isArray(parsed.slots)) return resetData(now);
  // Backward-compatible additive field: preserve existing browser bookings.
  if (!Array.isArray(parsed.receptionists)) parsed.receptionists = [{ receptionistId: 'rec1', staffId: 'REC-001', name: 'Reception Desk' }];
  return parsed;
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
