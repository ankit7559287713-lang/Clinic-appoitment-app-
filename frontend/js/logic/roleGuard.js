// Demo role checks. Not security — the front end can always be modified.
export const ROLES = { PATIENT: 'patient', DOCTOR: 'doctor' };

export const ROLE_LABELS = { patient: 'Patient', doctor: 'Doctor' };

export const HOME_PAGE = { patient: 'doctors.html', doctor: 'schedule.html' };

export const LOGIN_PAGE = { patient: 'patient-login.html', doctor: 'doctor-login.html' };

/** Which role a page belongs to (used to send signed-out visitors to the right login). */
export function roleForPage(page) {
  const allowed = PAGE_ACCESS[page];
  return Array.isArray(allowed) ? allowed[0] : null;
}

const PAGE_ACCESS = {
  home: 'any',
  settings: 'any',
  'patient-login': 'any',
  'doctor-login': 'any',
  doctors: ['patient'],
  book: ['patient'],
  appointments: ['patient'],
  schedule: ['doctor'],
};

export function canAccessPage(role, page) {
  const allowed = PAGE_ACCESS[page];
  if (allowed === 'any') return true;
  return Array.isArray(allowed) && allowed.includes(role);
}

/**
 * @param {{role:string, patientId?:string, doctorId?:string}} actor
 * @param {string} action book | cancel | review | complete | addSlot | removeSlot
 * @param {object} ctx  { patientId, doctorId, appointment }
 */
export function can(actor, action, ctx = {}) {
  if (!actor || !actor.role) return false;
  const { role } = actor;
  switch (action) {
    case 'book':
      return role === 'patient' && ctx.patientId === actor.patientId;
    case 'cancel':
      return role === 'patient' && ctx.appointment?.patientId === actor.patientId;
    case 'review':
      return role === 'patient' && ctx.patientId === actor.patientId;
    case 'complete':
      return role === 'doctor' && ctx.appointment?.doctorId === actor.doctorId;
    case 'addSlot':
    case 'removeSlot':
      return role === 'doctor' && ctx.doctorId === actor.doctorId;
    default:
      return false;
  }
}
