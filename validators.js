// Form validation. Each validator returns an object of { field: message }; empty = valid.
import { isValidISODate, isValidTime, timeToMinutes, toDateTime } from './dateUtils.js';

export const hasErrors = (errs) => Object.keys(errs).length > 0;

export function validatePatient({ name = '', phone = '', email = '' } = {}) {
  const errors = {};
  const n = name.trim();
  if (!n) errors.name = 'Enter the patient’s full name.';
  else if (n.length < 2 || n.length > 60) errors.name = 'Name must be 2–60 characters.';
  else if (!/^[\p{L}][\p{L} .'-]*$/u.test(n)) errors.name = 'Use letters, spaces, apostrophes or hyphens only.';

  const digits = phone.replace(/[\s()+-]/g, '');
  if (!phone.trim()) errors.phone = 'Enter a phone number so the clinic can reach the patient.';
  else if (!/^\d{10,15}$/.test(digits)) errors.phone = 'Phone must have 10–15 digits, e.g. 555-010-2001.';

  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = 'Enter a valid email like name@example.com, or leave it blank.';
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

  if (!Number.isInteger(dur) || dur < 10 || dur > 240) errors.duration = 'Duration must be between 10 and 240 minutes.';
  else if (!errors.startTime && startTime && timeToMinutes(startTime) + dur > 24 * 60) errors.duration = 'The slot must end before midnight.';

  if (!errors.date && !errors.startTime && date && startTime && toDateTime(date, startTime) <= now) {
    errors.startTime = 'This time has already passed. Choose a future time.';
  }
  return errors;
}

export const REVIEW_MAX_LENGTH = 300;

export function validateReview({ rating, comment = '' } = {}) {
  const errors = {};
  const r = Number(rating);
  if (!rating) errors.rating = 'Choose a star rating from 1 to 5.';
  else if (!Number.isInteger(r) || r < 1 || r > 5) errors.rating = 'Rating must be a whole number from 1 to 5.';
  if (comment.trim().length > REVIEW_MAX_LENGTH) errors.comment = `Keep your review under ${REVIEW_MAX_LENGTH} characters.`;
  return errors;
}
