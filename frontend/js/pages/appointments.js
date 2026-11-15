// Patient: My Appointments — upcoming, past and cancelled, with cancel and reviews.
import { initPage, $, $$, escapeHtml, statusBadge, dateBlock, timeRange, emptyState, toast, confirmDialog, showFieldErrors, clearFieldErrors } from '../ui/common.js';
import { starsHtml, RATING_WORDS } from '../ui/components.js';
import { addReview, updateReview, deleteReview, reviewForAppointment, visitsAwaitingReview } from '../logic/reviewService.js';
import { validateReview, hasErrors } from '../logic/validators.js';
import { cancelAppointment, classifyAppointments } from '../logic/bookingService.js';
import { formatLongDate, formatDate, formatTime } from '../logic/dateUtils.js';
import { staggerIn, leave, countUp, shake, canAnimate } from '../ui/motion.js';

const state = { tab: 'upcoming', reviewAppointmentId: null };
let ctxRef;
let reviewModal;


function lists() {
  const mine = ctxRef.data.appointments.filter((a) => a.patientId === ctxRef.session.patientId);
  return classifyAppointments(mine, new Date());
}

function render(animate) {
  const data = ctxRef.data;
  const me = data.patients.find((p) => p.patientId === ctxRef.session.patientId);
  const { upcoming, past, cancelled } = lists();
  $('#greeting').textContent = `Hi, ${me.name.split(' ')[0]}`;
  const next = upcoming[0];
  $('#nextUp').innerHTML = next
    ? `<i class="bi bi-bell text-turq me-1" aria-hidden="true"></i>Next visit: <strong>${formatDate(next.date)} at ${formatTime(next.startTime)}</strong> with ${escapeHtml(doctorOf(next).name)}`
    : 'You have no upcoming visits.';

  renderReviewPrompt(animate);

  const tabs = [
    { id: 'upcoming', label: 'Upcoming', icon: 'bi-calendar2-week', n: upcoming.length },
    { id: 'past', label: 'Past', icon: 'bi-clock-history', n: past.length },
    { id: 'cancelled', label: 'Cancelled', icon: 'bi-x-circle', n: cancelled.length },
  ];
  $('#apptTabs').innerHTML = tabs.map((t) => `<li class="nav-item" role="presentation">
    <button class="btn ${t.id === state.tab ? 'btn-primary' : 'btn-soft'}" role="tab" aria-selected="${t.id === state.tab}" data-tab="${t.id}">
      <i class="bi ${t.icon}" aria-hidden="true"></i>${t.label} <span class="badge rounded-pill ${t.id === state.tab ? 'text-bg-light' : 'bg-primary'}" data-n="${t.n}">${t.n}</span></button></li>`).join('');
  if (animate) $$('[data-n]').forEach((el) => countUp(el, Number(el.dataset.n), { duration: 0.8 }));

  const items = { upcoming, past, cancelled }[state.tab];
  const host = $('#apptList');
  if (!items.length) {
    const msg = {
      upcoming: { icon: 'bi-calendar2-plus', title: 'No upcoming appointments', text: 'Find a doctor and pick a time that works for you.', action: '<a class="btn btn-primary" href="doctors.html"><i class="bi bi-search-heart" aria-hidden="true"></i>Find a doctor</a>' },
      past: { icon: 'bi-clock-history', title: 'No past visits yet', text: 'Completed visits will appear here.' },
      cancelled: { icon: 'bi-emoji-smile', title: 'Nothing cancelled', text: 'Cancelled appointments are kept here for your records.' },
    }[state.tab];
    host.innerHTML = `<div class="card">${emptyState(msg)}</div>`;
    staggerIn(host.firstElementChild);
    return;
  }
  host.innerHTML = `<div class="d-grid gap-3">${items.map(card).join('')}</div>`;
  if (animate) staggerIn('#apptList .appt-card');
}

const doctorOf = (a) => ctxRef.data.doctors.find((d) => d.doctorId === a.doctorId) || { name: 'Unknown doctor', specialty: '' };

function card(a) {
  const doc = doctorOf(a);
  const canCancel = state.tab === 'upcoming' && a.status === 'Booked';
  const displayStatus = a.status;
  const review = a.status === 'Completed' ? reviewForAppointment(ctxRef.data, a.appointmentId) : null;
  return `<article class="card appt-card ${a.status === 'Cancelled' ? 'is-cancelled' : ''}" data-id="${a.appointmentId}" aria-label="${escapeHtml(doc.name)}, ${formatLongDate(a.date)}">
    ${dateBlock(a.date)}
    <div class="flex-grow-1 min-w-0">
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
        <h3 class="h6 mb-0">${escapeHtml(doc.name)} <span class="text-muted fw-normal small">· ${escapeHtml(doc.specialty)}</span></h3>
        ${statusBadge(displayStatus)}
      </div>
      <div class="small fw-semibold mb-1"><i class="bi bi-clock text-turq me-1" aria-hidden="true"></i>${timeRange(a)} <span class="text-muted fw-normal ms-2"><i class="bi bi-door-open me-1" aria-hidden="true"></i>${escapeHtml(doc.room || '')}</span></div>
      <p class="small text-muted mb-2 text-truncate-2"><i class="bi bi-chat-left-text me-1" aria-hidden="true"></i>${escapeHtml(a.reason)}</p>
      ${review ? `<div class="review-snippet"><div class="d-flex align-items-center gap-2">${starsHtml(review.rating, { cls: 'stars-sm' })}<span class="small fw-bold">${RATING_WORDS[review.rating]}</span><span class="small text-muted">· your review</span></div>
        ${review.comment ? `<p class="small mb-0 mt-1 text-truncate-2">“${escapeHtml(review.comment)}”</p>` : ''}</div>` : ''}
      <div class="d-flex flex-wrap gap-2">
        ${canCancel ? `<button class="btn btn-sm btn-outline-danger" data-cancel="${a.appointmentId}"><i class="bi bi-x-circle" aria-hidden="true"></i>Cancel</button>` : ''}
        ${state.tab !== 'upcoming' ? `<a class="btn btn-sm btn-soft" href="book.html?doctor=${a.doctorId}"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Book again</a>` : ''}
        ${a.status === 'Completed' && !review ? `<button class="btn btn-sm btn-primary" data-review="${a.appointmentId}"><i class="bi bi-star" aria-hidden="true"></i>Rate this visit</button>` : ''}
        ${review ? `<button class="btn btn-sm btn-outline-primary" data-review="${a.appointmentId}"><i class="bi bi-pencil" aria-hidden="true"></i>Edit review</button>` : ''}
        ${a.status === 'Booked' && state.tab === 'past' ? '<span class="small text-muted align-self-center">Awaiting doctor’s confirmation</span>' : ''}
      </div>
    </div>
  </article>`;
}

function bindEvents() {
  $('#apptTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    state.tab = t.dataset.tab;
    render(true);
  });
  $('#main').addEventListener('click', (e) => {
    const r = e.target.closest('[data-review]');
    if (r) openReview(r.dataset.review);
  });
  bindReviewModal();
  $('#apptList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    const a = ctxRef.data.appointments.find((x) => x.appointmentId === btn.dataset.cancel);
    const ok = await confirmDialog({
      title: 'Cancel this appointment?',
      body: `<strong>${escapeHtml(doctorOf(a).name)}</strong><br>${formatLongDate(a.date)}, ${formatTime(a.startTime)}<br><span class="small">The slot will be released for other patients.</span>`,
      confirmText: 'Yes, cancel it',
      icon: 'bi-calendar2-x',
    });
    if (!ok) return;
    const res = cancelAppointment({ appointmentId: a.appointmentId, actor: ctxRef.session });
    if (!res.ok) { toast(res.message, 'danger'); ctxRef.refresh(); return; }
    toast('Appointment cancelled. The slot is free for others now.');
    leave(btn.closest('.appt-card'), () => ctxRef.refresh());
  });
}

/* ---------------- reviews ---------------- */
function renderReviewPrompt(animate) {
  const host = $('#reviewPrompt');
  const pending = visitsAwaitingReview(ctxRef.data, ctxRef.session.patientId);
  if (!pending.length) { host.innerHTML = ''; return; }
  const a = pending[0];
  host.innerHTML = `<div class="review-prompt d-flex flex-wrap align-items-center gap-3 mb-4">
    <span class="prompt-icon"><i class="bi bi-star-half" aria-hidden="true"></i></span>
    <div class="flex-grow-1 min-w-0">
      <div class="fw-bold">How was your visit with ${escapeHtml(doctorOf(a).name)}?</div>
      <div class="small text-muted">${formatDate(a.date)} · ${escapeHtml(a.reason)}${pending.length > 1 ? ` · ${pending.length - 1} more visit${pending.length > 2 ? 's' : ''} to review` : ''}</div>
    </div>
    <button class="btn btn-primary" data-review="${a.appointmentId}"><i class="bi bi-star" aria-hidden="true"></i>Rate this visit</button>
  </div>`;
  if (animate && canAnimate()) {
    window.gsap.fromTo('#reviewPrompt .review-prompt', { y: -12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, delay: 0.3, ease: 'back.out(1.6)', clearProps: 'transform,opacity,visibility' });
    window.gsap.fromTo('#reviewPrompt .prompt-icon', { rotate: -25, scale: 0.6 }, { rotate: 0, scale: 1, duration: 0.7, delay: 0.5, ease: 'elastic.out(1, 0.5)', clearProps: 'transform' });
  }
}

function currentRating() {
  return Number($('#reviewForm input[name="rating"]:checked')?.value || 0);
}

function paintStars(n, { bounce = false } = {}) {
  $$('#starInput .star-label').forEach((label) => label.classList.toggle('on', Number(label.dataset.star) <= n));
  $('#ratingWord').textContent = n ? RATING_WORDS[n] : 'Tap a star to rate';
  if (bounce && canAnimate() && n) {
    window.gsap.fromTo($$('#starInput .star-label.on'), { scale: 0.6, rotate: -15 }, { scale: 1, rotate: 0, duration: 0.45, stagger: 0.05, ease: 'back.out(3)', clearProps: 'transform' });
  }
}

function openReview(appointmentId) {
  const data = ctxRef.data;
  const a = data.appointments.find((x) => x.appointmentId === appointmentId);
  if (!a) return;
  const existing = reviewForAppointment(data, appointmentId);
  state.reviewAppointmentId = appointmentId;
  const form = $('#reviewForm');
  form.reset();
  clearFieldErrors(form);
  $('#starInput').classList.remove('is-invalid');
  $('#rating-error').textContent = '';
  $('#reviewAlert').innerHTML = '';
  const doc = doctorOf(a);
  $('#reviewModalLabel').textContent = existing ? 'Edit your review' : 'Rate your visit';
  $('#reviewSummary').innerHTML = `
    <div class="summary-row"><i class="bi bi-person-badge" aria-hidden="true"></i><span>${escapeHtml(doc.name)} <span class="text-muted fw-normal">· ${escapeHtml(doc.specialty)}</span></span></div>
    <div class="summary-row"><i class="bi bi-calendar3" aria-hidden="true"></i><span>${formatLongDate(a.date)}, ${formatTime(a.startTime)}</span></div>
    <div class="summary-row"><i class="bi bi-chat-left-text" aria-hidden="true"></i><span class="fw-normal">${escapeHtml(a.reason)}</span></div>`;
  if (existing) {
    $(`#star${existing.rating}`).checked = true;
    $('#comment').value = existing.comment;
  }
  $('#commentCount').textContent = `${$('#comment').value.length}/300`;
  $('#deleteReviewBtn').classList.toggle('d-none', !existing);
  $('#submitReviewBtn').innerHTML = existing
    ? '<i class="bi bi-check2" aria-hidden="true"></i>Save changes'
    : '<i class="bi bi-send" aria-hidden="true"></i>Post review';
  paintStars(existing?.rating || 0);
  reviewModal.show();
}

function bindReviewModal() {
  reviewModal = new window.bootstrap.Modal($('#reviewModal'));
  const input = $('#starInput');
  input.addEventListener('mouseover', (e) => { const l = e.target.closest('[data-star]'); if (l) paintStars(Number(l.dataset.star)); });
  input.addEventListener('mouseleave', () => paintStars(currentRating()));
  input.addEventListener('change', () => {
    input.classList.remove('is-invalid');
    $('#rating-error').textContent = '';
    paintStars(currentRating(), { bounce: true });
  });
  $('#comment').addEventListener('input', (e) => { $('#commentCount').textContent = `${e.target.value.length}/300`; });
  $('#reviewModal').addEventListener('shown.bs.modal', () => ($('#reviewForm input[name="rating"]:checked') || $('#star5')).focus());

  $('#reviewForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const rating = currentRating();
    const comment = $('#comment').value;
    const errors = validateReview({ rating, comment });
    if (hasErrors(errors)) {
      input.classList.toggle('is-invalid', Boolean(errors.rating));
      $('#rating-error').textContent = errors.rating || '';
      showFieldErrors(form, errors.comment ? { comment: errors.comment } : {});
      if (errors.rating) $('#star5').focus();
      shake($('#reviewModal .modal-dialog'));
      return;
    }
    const existing = reviewForAppointment(ctxRef.data, state.reviewAppointmentId);
    const res = existing
      ? updateReview({ reviewId: existing.reviewId, rating, comment, actor: ctxRef.session })
      : addReview({ appointmentId: state.reviewAppointmentId, rating, comment, actor: ctxRef.session });
    if (!res.ok) {
      $('#reviewAlert').innerHTML = `<div class="alert alert-danger rounded-4 mb-0" role="alert"><i class="bi bi-exclamation-octagon me-1" aria-hidden="true"></i>${escapeHtml(res.message)}</div>`;
      shake($('#reviewModal .modal-dialog'));
      ctxRef.refresh();
      return;
    }
    reviewModal.hide();
    toast(existing ? 'Your review was updated.' : `Thanks! Your ${rating}-star review was posted.`);
    if (state.tab !== 'past') state.tab = 'past';
    ctxRef.refresh();
    const cardEl = $(`.appt-card[data-id="${state.reviewAppointmentId}"] .review-snippet`);
    if (cardEl && canAnimate()) window.gsap.fromTo(cardEl, { scale: 0.92, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2)', clearProps: 'transform,opacity,visibility' });
  });

  $('#deleteReviewBtn').addEventListener('click', () => {
    const existing = reviewForAppointment(ctxRef.data, state.reviewAppointmentId);
    if (!existing) return;
    $('#reviewModal').addEventListener('hidden.bs.modal', async () => {
      const ok = await confirmDialog({
        title: 'Delete your review?',
        body: 'Your rating and comment will be removed from this doctor’s profile. You can write a new review later.',
        confirmText: 'Delete review', cancelText: 'Keep it', icon: 'bi-trash3',
      });
      if (!ok) return;
      const res = deleteReview({ reviewId: existing.reviewId, actor: ctxRef.session });
      if (!res.ok) { toast(res.message, 'danger'); ctxRef.refresh(); return; }
      toast('Review deleted.');
      ctxRef.refresh();
    }, { once: true });
    reviewModal.hide();
  });
}

initPage({
  page: 'appointments',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    if (!isRefresh) bindEvents();
    render(!isRefresh);
  },
});
