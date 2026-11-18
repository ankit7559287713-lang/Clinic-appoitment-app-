// Reusable rendering pieces shared across pages.
import { toISODate, addDays, parseISODate, formatDate } from '../logic/dateUtils.js';
import { escapeHtml, avatar } from './common.js';

/** Horizontal strip of day chips. meta(iso) → { label, full } */
export function renderDayStrip(el, { start, count = 14, selected, today, meta = () => ({}) }) {
  const chips = [];
  for (let i = 0; i < count; i++) {
    const iso = toISODate(addDays(parseISODate(start), i));
    const d = parseISODate(iso);
    const m = meta(iso) || {};
    const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
    const full = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    chips.push(`<button type="button" class="day-chip ${iso === selected ? 'active' : ''} ${m.full ? 'is-full' : ''}" data-date="${iso}"
      aria-pressed="${iso === selected}" aria-label="${full}${iso === today ? ', today' : ''}${m.label ? `, ${m.label}` : ''}">
      ${iso === today ? '<span class="today-dot" aria-hidden="true"></span>' : ''}
      <span class="dow">${iso === today ? 'Today' : dow}</span>
      <span class="dom">${d.getDate()}</span>
      ${m.label ? `<span class="cnt">${m.label}</span>` : ''}
    </button>`);
  }
  el.innerHTML = chips.join('');
  el.querySelector('.day-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/* ---------------- ratings & reviews ---------------- */

export const RATING_WORDS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };

/** Read-only stars, supports halves. Always paired with an accessible label. */
export function starsHtml(value, { cls = '' } = {}) {
  const v = Number(value) || 0;
  const icons = [1, 2, 3, 4, 5].map((i) => {
    const icon = v >= i ? 'bi-star-fill' : v >= i - 0.5 ? 'bi-star-half' : 'bi-star';
    return `<i class="bi ${icon}" aria-hidden="true"></i>`;
  }).join('');
  return `<span class="stars ${cls}" role="img" aria-label="Rated ${v} out of 5">${icons}</span>`;
}

/** Compact "★ 4.7 (12 reviews)" line for cards. */
export function ratingInline(rating) {
  if (!rating.count) return '<span class="rating-inline text-muted"><i class="bi bi-star" aria-hidden="true"></i>No reviews yet</span>';
  return `<span class="rating-inline">${starsHtml(rating.average, { cls: 'stars-sm' })}<strong>${rating.average.toFixed(1)}</strong>
    <span class="text-muted">(${rating.count} review${rating.count === 1 ? '' : 's'})</span></span>`;
}

/** Big average + 5→1 distribution bars. Bars animate from data-width. */
export function ratingSummaryHtml(rating) {
  if (!rating.count) return '';
  const pct = (n) => Math.round((n / rating.count) * 100); // share of all reviews
  return `<div class="rating-summary">
    <div class="rating-score">
      <div class="rating-big">${rating.average.toFixed(1)}</div>
      ${starsHtml(rating.average)}
      <div class="small text-muted mt-1">${rating.count} review${rating.count === 1 ? '' : 's'}</div>
    </div>
    <ul class="rating-bars" aria-label="Rating breakdown">
      ${rating.distribution.map((d) => `<li>
        <span class="rb-label">${d.star}<i class="bi bi-star-fill" aria-hidden="true"></i></span>
        <span class="rb-track"><span class="rb-fill" data-width="${pct(d.count)}" style="width:${pct(d.count)}%"></span></span>
        <span class="rb-count">${d.count}<span class="visually-hidden"> ${d.star}-star review${d.count === 1 ? '' : 's'}</span></span>
      </li>`).join('')}
    </ul>
  </div>`;
}

/** Show patients as "Aarav S." to keep reviews friendly but private. */
export function reviewerName(name = '') {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.pop();
  return last ? `${first} ${last[0]}.` : first;
}

export function reviewItemHtml(review, data, { showDoctor = false } = {}) {
  const patient = data.patients.find((p) => p.patientId === review.patientId) || { name: 'Former patient', patientId: 'x' };
  const doctor = data.doctors.find((d) => d.doctorId === review.doctorId);
  const when = formatDate(review.createdAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' });
  return `<li class="review-item">
    ${avatar({ ...patient, name: patient.name }, 'avatar-sm')}
    <div class="min-w-0 flex-grow-1">
      <div class="d-flex flex-wrap justify-content-between gap-1 align-items-baseline">
        <strong>${escapeHtml(reviewerName(patient.name))}</strong>
        <span class="small text-muted">${when}${review.updatedAt ? ' · edited' : ''}</span>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2 my-1">
        ${starsHtml(review.rating, { cls: 'stars-sm' })}
        <span class="verified"><i class="bi bi-patch-check-fill" aria-hidden="true"></i>Verified visit</span>
        ${showDoctor && doctor ? `<span class="small text-muted">· ${escapeHtml(doctor.name)}</span>` : ''}
      </div>
      ${review.comment ? `<p class="mb-0 review-text">${escapeHtml(review.comment)}</p>` : '<p class="mb-0 small text-muted fst-italic">No written comment.</p>'}
    </div>
  </li>`;
}

/** Full reviews block: summary + list with "Show more". Returns html; call bindReviewList after inserting. */
export function reviewsBlockHtml(rating, reviews, data, { limit = 3, emptyText = 'No reviews yet.' } = {}) {
  if (!reviews.length) {
    return `<div class="text-center py-4 text-muted"><i class="bi bi-chat-square-heart fs-2 d-block mb-2 text-turq" aria-hidden="true"></i>${emptyText}</div>`;
  }
  return `${ratingSummaryHtml(rating)}
    <ul class="review-list" data-limit="${limit}">
      ${reviews.map((r, i) => reviewItemHtml(r, data).replace('<li class="review-item">', `<li class="review-item${i >= limit ? ' d-none' : ''}">`)).join('')}
    </ul>
    ${reviews.length > limit ? `<button type="button" class="btn btn-soft w-100 mt-3" data-show-reviews>Show all ${reviews.length} reviews</button>` : ''}`;
}

export function bindReviewList(root, onReveal) {
  root.querySelector('[data-show-reviews]')?.addEventListener('click', (e) => {
    const hidden = [...root.querySelectorAll('.review-item.d-none')];
    hidden.forEach((li) => li.classList.remove('d-none'));
    e.currentTarget.remove();
    onReveal?.(hidden);
  });
}
