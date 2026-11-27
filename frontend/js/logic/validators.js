// Form validation. Each validator returns an object of { field: message }; empty = valid.
import { isValidISODate, isValidTime, timeToMinutes, toDateTime } from './dateUtils.js';

export const hasErrors = (errs) => Object.keys(errs).length > 0;

export function validatePatient({ name = '', phone = '', email = '' } = {}) {
  const errors = {};
  const n = name.trim();
  if (!n) errors.name = 'Enter the patient’s full name.';
  else if (n.length < 2 || n.length > 60) errors.name = 'Name must be 2–60 characters.';
  else if (!/^[\p{L}][\p{L} .'-]*$/u.test(n)) errors.name = 'Use letters, spaces, apostrophes or hyphens only.';

  if (!phone.trim()) errors.phone = 'Enter a phone number so the clinic can reach the patient.';
  else if (!/^\d{10}$/.test(phone.trim())) errors.phone = 'Enter exactly 10 digits for an Indian mobile number.';

  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = 'Enter a valid email like name@example.com, or leave it blank.';
  return errors;
}

export function validatePatientRegistration({ name = '', phone = '', email = '', age, gender = '', address = '' } = {}) {
  const errors = validatePatient({ name, phone, email });
  const parsedAge = Number(age);
  if (age === '' || age === null || age === undefined || !Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120) {
    errors.age = 'Enter an age from 0 to 120.';
  }
  if (!['Female', 'Male', 'Non-binary', 'Prefer not to say'].includes(String(gender).trim())) {
    errors.gender = 'Choose a gender option.';
  }
  const normalizedAddress = String(address).trim();
  if (normalizedAddress.length < 3 || normalizedAddress.length > 240) {
    errors.address = 'Address must be 3–240 characters.';
  }
  return errors;
}

export function validateDoctor({ staffId = '', name = '', specialty = '', experience, room = '', qualification = '', bio = '', consultationFee = '' } = {}) {
  const errors = {};
  const id = String(staffId).trim().toUpperCase();
  if (!/^DOC-\d{3}$/.test(id)) errors.staffId = 'Staff IDs must look like DOC-101.';
  if (String(name).trim().length < 2 || String(name).trim().length > 80) errors.name = 'Enter a doctor name (2–80 characters).';
  if (String(specialty).trim().length < 2 || String(specialty).trim().length > 80) errors.specialty = 'Enter a specialty (2–80 characters).';
  const years = Number(experience);
  if (!Number.isInteger(years) || years < 0 || years > 70) errors.experience = 'Experience must be a whole number from 0 to 70.';
  if (String(room).trim().length < 1 || String(room).trim().length > 40) errors.room = 'Enter a room (up to 40 characters).';
  if (String(qualification).trim().length < 2 || String(qualification).trim().length > 120) errors.qualification = 'Enter a qualification (2–120 characters).';
  if (String(bio).trim().length > 300) errors.bio = 'Keep the biography to 300 characters or fewer.';
  if (consultationFee !== '' && (!Number.isFinite(Number(consultationFee)) || Number(consultationFee) < 0)) {
    errors.consultationFee = 'Enter a valid non-negative consultation fee.';
  }
  return errors;
}

export function validateReason(reason = '') {
  const r = reason.trim();
  if (!r) return { reason: 'Tell the doctor briefly why you are visiting.' };
  if (r.length < 3) return { reason: 'Reason must be at least 3 characters.' };
  if (r.length > 200) return { reason: 'Keep the reason under 200 characters.' };
  return {};
}

export function validateTimeOrder(startTime, endTime) {
  if (!isValidTime(startTime) || !isValidTime(endTime)) return { startTime: 'Enter valid times.' };
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) return { startTime: 'Start time must be earlier than end time.' };
  return {};
}

export function validateSlotInput({ date, startTime, duration } = {}, now = new Date()) {
  const errors = {};
  const dur = Number(duration);
  if (!date) errors.date = 'Choose a date.';
  else if (!isValidISODate(date)) errors.date = 'Enter a valid date.';

  if (!startTime) errors.startTime = 'Choose a start time.';
  else if (!isValidTime(startTime)) errors.startTime = 'Enter a valid time (HH:MM).';

  if (dur !== 30) errors.duration = 'Appointments must use a 30-minute block.';
  else if (!errors.startTime && startTime && timeToMinutes(startTime) + dur >= 24 * 60) errors.duration = 'The slot must end before midnight.';

  if (!errors.date && !errors.startTime && date && startTime && toDateTime(date, startTime) <= now) {
    errors.startTime = 'This time has already passed. Choose a future time.';
  }
  return errors;
}
