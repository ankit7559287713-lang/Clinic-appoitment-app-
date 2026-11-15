// Patient reviews. A patient can review a doctor once per COMPLETED visit,
// and can edit or delete only their own review. DOM-free and unit-tested.
import { transact, ok, fail, newId } from './storage.js';
import { can } from './roleGuard.js';
import { validateReview, hasErrors } from './validators.js';

const reviewsOf = (data) => data.reviews || [];

export function reviewForAppointment(data, appointmentId) {
  return reviewsOf(data).find((r) => r.appointmentId === appointmentId) || null;
}

export function listDoctorReviews(data, doctorId) {
  return reviewsOf(data)
    .filter((r) => r.doctorId === doctorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Derived rating summary — never stored. */
export function doctorRating(data, doctorId) {
  const list = reviewsOf(data).filter((r) => r.doctorId === doctorId);
  const count = list.length;
  const average = count ? Math.round((list.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : null;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: list.filter((r) => r.rating === star).length }));
  return { average, count, distribution };
}

/** Completed visits by this patient that don't have a review yet. */
export function visitsAwaitingReview(data, patientId) {
  return data.appointments
    .filter((a) => a.patientId === patientId && a.status === 'Completed' && !reviewForAppointment(data, a.appointmentId))
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
}

export function addReview({ appointmentId, rating, comment = '', actor }, now = new Date()) {
  const errors = validateReview({ rating, comment });
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please fix the highlighted fields.', { errors });
  return transact((data) => {
    data.reviews ||= [];
    const appt = data.appointments.find((a) => a.appointmentId === appointmentId);
    if (!appt) return fail('APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    if (!can(actor, 'review', { patientId: appt.patientId })) return fail('UNAUTHORIZED', 'You can only review your own visits.');
    if (appt.status !== 'Completed') return fail('NOT_COMPLETED', 'You can review a visit once the doctor has marked it completed.');
    if (reviewForAppointment(data, appointmentId)) return fail('ALREADY_REVIEWED', 'You’ve already reviewed this visit. You can edit your review instead.');
    const review = {
      reviewId: newId('r'),
      appointmentId,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      rating: Number(rating),
      comment: comment.trim(),
      createdAt: now.toISOString(),
      updatedAt: null,
    };
    data.reviews.push(review);
    return ok({ review });
  });
}

export function updateReview({ reviewId, rating, comment = '', actor }, now = new Date()) {
  const errors = validateReview({ rating, comment });
  if (hasErrors(errors)) return fail('INVALID_INPUT', 'Please fix the highlighted fields.', { errors });
  return transact((data) => {
    const review = reviewsOf(data).find((r) => r.reviewId === reviewId);
    if (!review) return fail('REVIEW_NOT_FOUND', 'That review no longer exists.');
    if (!can(actor, 'review', { patientId: review.patientId })) return fail('UNAUTHORIZED', 'You can only edit your own reviews.');
    review.rating = Number(rating);
    review.comment = comment.trim();
    review.updatedAt = now.toISOString();
    return ok({ review });
  });
}

export function deleteReview({ reviewId, actor }) {
  return transact((data) => {
    const review = reviewsOf(data).find((r) => r.reviewId === reviewId);
    if (!review) return fail('REVIEW_NOT_FOUND', 'That review no longer exists.');
    if (!can(actor, 'review', { patientId: review.patientId })) return fail('UNAUTHORIZED', 'You can only delete your own reviews.');
    data.reviews = data.reviews.filter((r) => r.reviewId !== reviewId);
    return ok({ review });
  });
}
