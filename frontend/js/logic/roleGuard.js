// Demo role checks. Not security — the front end can always be modified.
export const ROLES = { PATIENT: 'patient', DOCTOR: 'doctor', RECEPTIONIST: 'receptionist' };

export const ROLE_LABELS = { patient: 'Patient', doctor: 'Doctor', receptionist: 'Receptionist' };

export const HOME_PAGE = { patient: 'doctors.html', doctor: 'schedule.html', receptionist: 'receptionist.html' };

export const LOGIN_PAGE = { patient: 'patient-login.html', doctor: 'doctor-login.html', receptionist: 'receptionist-login.html' };

/** Which role a page belongs to (used to send signed-out visitors to the right login). */
export function roleForPage(page) {
  const allowed = PAGE_ACCESS[page];
  return Array.isArray(allowed) ? allowed[0] : null;
}

const PAGE_ACCESS = {
  home: 'any',
  settings: 'any',
  'patient-login': 'any',
  'patient-register': 'any',
  'doctor-login': 'any',
  'receptionist-login': 'any',
  doctors: ['patient'],
  book: ['patient'],
  appointments: ['patient'],
  schedule: ['doctor'],
  receptionist: ['receptionist'],
  'patient-record': ['doctor', 'receptionist'],
};

export function canAccessPage(role, page) {
  const allowed = PAGE_ACCESS[page];
  if (allowed === 'any') return true;
  return Array.isArray(allowed) && allowed.includes(role);
}

/**
 * @param {{role:string, patientId?:string, doctorId?:string}} actor
 * @param {string} action book | cancel | complete | startConsultation | addSlot | removeSlot | emergencyRequest | emergencyDecision | emergencyManage | consultationWrite | clinicalRead | registerPatient | queueUpdate | qrCheckIn | doctorManage | patientImport | doctorQueueUpdate
 * @param {object} ctx  { patientId, doctorId, appointment }
 */
export function can(actor, action, ctx = {}) {
  if (!actor || !actor.role) return false;
  const { role } = actor;
  switch (action) {
    case 'book':
      return (role === 'patient' && ctx.patientId === actor.patientId) || role === 'receptionist';
    case 'cancel':
      return (role === 'patient' && ctx.appointment?.patientId === actor.patientId) || role === 'receptionist';
    case 'complete':
    case 'startConsultation':
      return role === 'doctor' && ctx.appointment?.doctorId === actor.doctorId;
    case 'addSlot':
    case 'removeSlot':
      return role === 'doctor' && ctx.doctorId === actor.doctorId;
    case 'emergencyRequest':
      return role === 'patient' && ctx.patientId === actor.patientId;
    case 'consultationWrite':
      return role === 'doctor' && ctx.doctorId === actor.doctorId;
    case 'emergencyDecision':
    case 'doctorManage':
    case 'patientImport':
      return role === 'receptionist';
    case 'emergencyManage':
      return role === 'doctor' && ctx.emergency?.doctorId === actor.doctorId;
    case 'doctorQueueUpdate':
      return role === 'doctor' && ctx.queueEntry?.doctorId === actor.doctorId;
    case 'clinicalRead':
      return (role === 'patient' && ctx.patientId === actor.patientId) ||
        (role === 'doctor' && ctx.doctorId === actor.doctorId) ||
        role === 'receptionist';
    case 'registerPatient':
    case 'queueUpdate':
    case 'qrCheckIn':
      return role === 'receptionist';
    default:
      return false;
  }
}
