// Slot picker + booking modal. Booking goes through bookAppointment(), which
// re-reads storage and checks availability in the same synchronous step.
import { initPage, $, $$, escapeHtml, avatar, emptyState, toast, showFieldErrors, clearFieldErrors } from '../ui/common.js';
import { renderDayStrip, ratingInline, reviewsBlockHtml, bindReviewList } from '../ui/components.js';
import { doctorRating, listDoctorReviews } from '../logic/reviewService.js';
import { getSession } from '../ui/session.js';
import { listSlots, nextAvailableSlot } from '../logic/slotService.js';
import { bookAppointment } from '../logic/bookingService.js';
import { validateReason, hasErrors } from '../logic/validators.js';
import { toISODate, addDays, parseISODate, formatLongDate, formatDate, formatTime, timeToMinutes } from '../logic/dateUtils.js';
import { staggerIn, popIn, pulse, shake, celebrate, growBars } from '../ui/motion.js';

const params = new URLSearchParams(window.location.search);
const state = { doctorId: params.get('doctor'), date: params.get('date'), selectedSlotId: null, hidePast: true };
let ctxRef;
let modal;


const currentDoctor = () => ctxRef.data.doctors.find((d) => d.doctorId === state.doctorId);

function renderMissingDoctor() {
  $('#main .container').innerHTML = `<div class="card mx-auto" style="max-width:560px">${emptyState({
    icon: 'bi-person-x', title: 'We couldn’t find that doctor',
    text: 'The link may be out of date. Pick a doctor from the directory.',
    action: '<a class="btn btn-primary" href="doctors.html"><i class="bi bi-arrow-left" aria-hidden="true"></i>Back to doctors</a>',
  })}</div>`;
}

function renderProfile(doctor) {
  $('#crumbDoctor').textContent = doctor.name;
  document.title = `Book ${doctor.name} · ClinicBook`;
  const next = nextAvailableSlot(ctxRef.data, doctor.doctorId);
  const onLeave = doctor.status !== 'active';
  $('#doctorProfile').innerHTML = `
    <div class="card p-4 text-center" data-animate>
      <div class="d-flex justify-content-center mb-3">${avatar(doctor, 'avatar-lg')}</div>
      <h1 class="h4 mb-1">${escapeHtml(doctor.name)}</h1>
      <div class="fw-semibold text-turq mb-2">${escapeHtml(doctor.specialty)}</div>
      <div class="d-flex justify-content-center mb-3"><a href="#reviewsTitle" class="text-decoration-none text-reset">${ratingInline(doctorRating(ctxRef.data, doctor.doctorId))}</a></div>
      <p class="small text-muted">${escapeHtml(doctor.bio)}</p>
      <div class="d-flex justify-content-center flex-wrap gap-2 mb-4">
        <span class="status-badge status-Past"><i class="bi bi-award" aria-hidden="true"></i>${doctor.experience} yrs</span>
        <span class="status-badge status-Past"><i class="bi bi-door-open" aria-hidden="true"></i>${escapeHtml(doctor.room)}</span>
        ${onLeave ? '<span class="status-badge status-onleave"><i class="bi bi-airplane" aria-hidden="true"></i>On leave</span>' : ''}
      </div>
      ${next
        ? `<div class="summary-box text-start mb-3"><div class="small text-muted fw-semibold mb-1">Next available</div>
             <div class="fw-bold"><i class="bi bi-lightning-charge-fill text-turq me-1" aria-hidden="true"></i>${formatDate(next.date)}, ${formatTime(next.startTime)}</div></div>
           <button type="button" class="btn btn-primary w-100" id="jumpNext"><i class="bi bi-skip-forward-fill" aria-hidden="true"></i>Book next available</button>`
        : '<p class="small text-muted mb-0"><i class="bi bi-calendar-x me-1" aria-hidden="true"></i>No open slots right now.</p>'}
    </div>`;
  $('#jumpNext')?.addEventListener('click', () => {
    const n = nextAvailableSlot(ctxRef.data, state.doctorId);
    if (!n) return;
    state.date = n.date;
    state.hidePast = true; $('#hidePast').checked = true;
    renderDays(currentDoctor());
    renderSlots(currentDoctor(), true);
    const btn = $(`[data-slot="${n.slotId}"]`);
    btn?.focus();
    pulse(btn);
  });
}

function renderDays(doctor) {
  const now = new Date();
  const today = toISODate(now);
  let start = today;
  const span = 14;
  if (state.date > toISODate(addDays(now, span - 1))) start = toISODate(addDays(parseISODate(state.date), -3));
  const slots = listSlots(ctxRef.data, { doctorId: doctor.doctorId }, now);
  renderDayStrip($('#dayStrip'), {
    start, count: span, selected: state.date, today,
    meta: (iso) => {
      const day = slots.filter((s) => s.date === iso);
      if (!day.length) return { label: 'No slots' };
      const open = day.filter((s) => s.status === 'Available' && !s.isPast).length;
      return open ? { label: `${open} open` } : { label: 'Full', full: true };
    },
  });
  const picker = $('#datePicker');
  picker.min = today;
  picker.value = state.date;
  window.history.replaceState(null, '', `?doctor=${doctor.doctorId}&date=${state.date}`);
}

const slotPeriod = (t) => (timeToMinutes(t) < 720 ? 'Morning' : timeToMinutes(t) < 1020 ? 'Afternoon' : 'Evening');
const PERIOD_ICON = { Morning: 'bi-sunrise', Afternoon: 'bi-sun', Evening: 'bi-moon' };

function renderSlots(doctor, animate) {
  const area = $('#slotArea');
  const now = new Date();
  $('#slotsTitle').textContent = `Times on ${formatLongDate(state.date)}`;

  if (doctor.status !== 'active') {
    $('#slotsSummary').textContent = '';
    area.innerHTML = emptyState({ icon: 'bi-airplane', title: `${escapeHtml(doctor.name)} is on leave`, text: 'Bookings are paused. Please choose another doctor.', action: '<a class="btn btn-primary" href="doctors.html">See other doctors</a>' });
    return;
  }

  const all = listSlots(ctxRef.data, { doctorId: doctor.doctorId, date: state.date }, now);
  const visible = state.hidePast ? all.filter((s) => !s.isPast) : all;
  const open = all.filter((s) => s.status === 'Available' && !s.isPast).length;
  $('#slotsSummary').textContent = all.length ? `${open} of ${all.length} slots available` : '';

  if (!visible.length) {
    const next = nextAvailableSlot(ctxRef.data, doctor.doctorId, now);
    area.innerHTML = emptyState({
      icon: all.length ? 'bi-clock-history' : 'bi-calendar2-x',
      title: all.length ? 'All times on this day have passed' : 'No slots on this day',
      text: next ? `The next opening is ${formatDate(next.date)} at ${formatTime(next.startTime)}.` : 'This doctor has no open slots yet.',
      action: next ? `<button class="btn btn-primary" data-goto="${next.date}"><i class="bi bi-skip-forward-fill" aria-hidden="true"></i>Go to next available</button>` : '',
    });
    return;
  }

  const groups = {};
  visible.forEach((s) => { (groups[slotPeriod(s.startTime)] ||= []).push(s); });
  area.innerHTML = Object.entries(groups).map(([period, slots]) => `
    <div class="mb-4">
      <div class="slot-group-title mb-2"><i class="bi ${PERIOD_ICON[period]}" aria-hidden="true"></i>${period}</div>
      <div class="slot-grid" role="group" aria-label="${period} slots">
        ${slots.map(slotButton).join('')}
      </div>
    </div>`).join('');
  if (animate) popIn('#slotArea .slot-btn');
}

function slotButton(s) {
  const time = formatTime(s.startTime);
  const range = `${time} to ${formatTime(s.endTime)}`;
  if (s.status === 'Booked') {
    return `<button type="button" class="slot-btn is-booked" disabled aria-label="${range}, booked">
      <span class="slot-time">${time}</span><span class="slot-state"><i class="bi bi-lock-fill" aria-hidden="true"></i>Booked</span></button>`;
  }
  if (s.isPast) {
    return `<button type="button" class="slot-btn is-past" disabled aria-label="${range}, past">
      <span class="slot-time">${time}</span><span class="slot-state"><i class="bi bi-clock-history" aria-hidden="true"></i>Past</span></button>`;
  }
  const sel = s.slotId === state.selectedSlotId;
  return `<button type="button" class="slot-btn" data-slot="${s.slotId}" aria-pressed="${sel}" aria-label="${range}, available">
    <span class="slot-time">${time}</span><span class="slot-state"><i class="bi bi-check-circle" aria-hidden="true"></i>Available</span></button>`;
}

function bindEvents() {
  $('#dayStrip').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-date]');
    if (!chip) return;
    selectDate(chip.dataset.date);
  });
  $('#datePicker').addEventListener('change', (e) => { if (e.target.value) selectDate(e.target.value); });
  $('#hidePast').addEventListener('change', (e) => { state.hidePast = e.target.checked; renderSlots(currentDoctor(), true); });
  $('#slotArea').addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) return selectDate(go.dataset.goto);
    const btn = e.target.closest('[data-slot]');
    if (!btn) return;
    selectSlot(btn.dataset.slot, btn);
  });

  const form = $('#bookingForm');
  form.addEventListener('submit', onSubmit);
  $('#reason').addEventListener('input', (e) => { $('#reasonCount').textContent = `${e.target.value.length}/200`; });
  $('#bookingModal').addEventListener('click', (e) => {
    const alt = e.target.closest('[data-alt-slot]');
    if (alt) { state.selectedSlotId = alt.dataset.altSlot; fillSummary(); $('#bookingAlert').innerHTML = ''; pulse($('#bookingSummary')); }
  });
  $('#bookingModal').addEventListener('shown.bs.modal', () => $('#reason').focus());
  $('#bookingModal').addEventListener('hidden.bs.modal', () => {
    $('#bookingStepForm').classList.remove('d-none');
    $('#bookingStepSuccess').classList.add('d-none');
    state.selectedSlotId = null;
    renderSlots(currentDoctor(), false);
  });
}

function selectDate(iso) {
  if (iso < toISODate(new Date())) { toast('Past dates can’t be booked. Showing today instead.', 'warning'); iso = toISODate(new Date()); }
  state.date = iso;
  state.selectedSlotId = null;
  renderDays(currentDoctor());
  renderSlots(currentDoctor(), true);
}

function selectSlot(slotId, btn) {
  state.selectedSlotId = slotId;
  $$('#slotArea [data-slot]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slot === slotId)));
  pulse(btn);
  openModal();
}

function selectedSlot() {
  return ctxRef.data.slots.find((s) => s.slotId === state.selectedSlotId);
}

function fillSummary() {
  const slot = selectedSlot();
  const doctor = currentDoctor();
  const dur = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
  $('#bookingSummary').innerHTML = `
    <div class="summary-row"><i class="bi bi-person-badge" aria-hidden="true"></i><span>${escapeHtml(doctor.name)} <span class="text-muted fw-normal">· ${escapeHtml(doctor.specialty)}</span></span></div>
    <div class="summary-row"><i class="bi bi-calendar3" aria-hidden="true"></i><span>${formatLongDate(slot.date)}</span></div>
    <div class="summary-row"><i class="bi bi-clock" aria-hidden="true"></i><span>${formatTime(slot.startTime)} – ${formatTime(slot.endTime)} <span class="text-muted fw-normal">(${dur} min)</span></span></div>
    <div class="summary-row"><i class="bi bi-door-open" aria-hidden="true"></i><span>${escapeHtml(doctor.room)}</span></div>`;
}

function openModal() {
  const form = $('#bookingForm');
  form.reset();
  clearFieldErrors(form);
  $('#reasonCount').textContent = '0/200';
  $('#bookingAlert').innerHTML = '';
  fillSummary();
  renderPatientSection();
  modal.show();
}

function renderPatientSection() {
  const session = getSession();
  const p = ctxRef.data.patients.find((x) => x.patientId === session.patientId);
  $('#patientSection').innerHTML = `<div class="d-flex align-items-center gap-3 p-3 rounded-4 border">${avatar(p, 'avatar-sm')}
    <div><div class="small text-muted fw-semibold">Patient</div><div class="fw-bold">${escapeHtml(p.name)}</div></div></div>`;
}

function alertHtml(variant, icon, html) {
  return `<div class="alert alert-${variant} d-flex gap-2 align-items-start mb-0 rounded-4" role="alert"><i class="bi ${icon} mt-1" aria-hidden="true"></i><div>${html}</div></div>`;
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const session = getSession();
  const reason = $('#reason').value;
  const errors = { ...validateReason(reason) };

  const patientId = session.patientId;
  if (hasErrors(errors)) { showFieldErrors(form, errors); shake($('#bookingModal .modal-dialog')); return; }
  clearFieldErrors(form);

  const btn = $('#confirmBtn');
  btn.disabled = true;
  const res = bookAppointment({ slotId: state.selectedSlotId, patientId, reason, actor: session });
  btn.disabled = false;

  if (res.ok) {
    ctxRef.refresh();
    showSuccess(res);
    toast(`Booked ${res.doctor.name} on ${formatDate(res.appointment.date)} at ${formatTime(res.appointment.startTime)}.`);
    return;
  }

  // Failure paths: show why, refresh availability, suggest another time.
  ctxRef.refresh();
  const box = $('#bookingAlert');
  if (res.code === 'INVALID_INPUT') { showFieldErrors(form, res.errors); return; }
  if (['SLOT_TAKEN', 'SLOT_IN_PAST', 'SLOT_NOT_FOUND'].includes(res.code)) {
    const alt = suggestAlternative();
    box.innerHTML = alertHtml('danger', 'bi-exclamation-octagon', `<strong>${escapeHtml(res.message)}</strong>
      ${alt ? `<div class="mt-2"><button type="button" class="btn btn-sm btn-primary" data-alt-slot="${alt.slotId}"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Switch to ${alt.date === state.date ? '' : `${formatDate(alt.date)}, `}${formatTime(alt.startTime)}</button>
      <button type="button" class="btn btn-sm btn-light border ms-1" data-bs-dismiss="modal">Pick another time</button></div>` : ''}`);
  } else if (res.code === 'PATIENT_OVERLAP') {
    const c = res.clash;
    const doc = ctxRef.data.doctors.find((d) => d.doctorId === c.doctorId);
    box.innerHTML = alertHtml('warning', 'bi-exclamation-triangle', `<strong>You already have an appointment at that time.</strong><br>
      <span class="small">${escapeHtml(doc?.name || '')}, ${formatDate(c.date)} ${formatTime(c.startTime)}–${formatTime(c.endTime)}. Choose a time that doesn’t overlap.</span>`);
  } else {
    box.innerHTML = alertHtml('danger', 'bi-exclamation-octagon', escapeHtml(res.message));
  }
  shake($('#bookingModal .modal-dialog'));
}

function suggestAlternative() {
  const now = new Date();
  const taken = ctxRef.data.slots.find((s) => s.slotId === state.selectedSlotId);
  const all = listSlots(ctxRef.data, { doctorId: state.doctorId }, now).filter((s) => s.status === 'Available' && !s.isPast);
  if (!taken) return all[0] || null;
  return all.find((s) => `${s.date}${s.startTime}` > `${taken.date}${taken.startTime}`) || all[0] || null;
}

function showSuccess(res) {
  const { appointment: a, doctor, patient } = res;
  $('#bookingStepForm').classList.add('d-none');
  $('#bookingStepSuccess').classList.remove('d-none');
  $('#successSummary').innerHTML = `
    <div class="summary-row"><i class="bi bi-person" aria-hidden="true"></i><span>${escapeHtml(patient.name)}</span></div>
    <div class="summary-row"><i class="bi bi-person-badge" aria-hidden="true"></i><span>${escapeHtml(doctor.name)} <span class="text-muted fw-normal">· ${escapeHtml(doctor.specialty)}</span></span></div>
    <div class="summary-row"><i class="bi bi-calendar3" aria-hidden="true"></i><span>${formatLongDate(a.date)}</span></div>
    <div class="summary-row"><i class="bi bi-clock" aria-hidden="true"></i><span>${formatTime(a.startTime)} – ${formatTime(a.endTime)}</span></div>
    <div class="summary-row"><i class="bi bi-chat-left-text" aria-hidden="true"></i><span class="fw-normal">${escapeHtml(a.reason)}</span></div>`;
  $('#successActions').innerHTML = `<a class="btn btn-primary" href="appointments.html"><i class="bi bi-calendar2-check" aria-hidden="true"></i>View my appointments</a>
    <button type="button" class="btn btn-light border" data-bs-dismiss="modal">Done</button>`;
  $('#successTitle').focus();
  celebrate($('#successBurst'));
  staggerIn('#successSummary .summary-row, #successActions > *', { delay: 0.5, stagger: 0.06 });
}

function renderReviews(doctor, animate) {
  const host = $('#doctorReviews');
  const firstName = doctor.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  host.innerHTML = reviewsBlockHtml(doctorRating(ctxRef.data, doctor.doctorId), listDoctorReviews(ctxRef.data, doctor.doctorId), ctxRef.data, {
    limit: 3,
    emptyText: `No reviews for Dr. ${escapeHtml(firstName)} yet. Patients can leave one after a completed visit.`,
  });
  bindReviewList(host, (items) => staggerIn(items, { stagger: 0.06 }));
  if (animate) growBars(host);
}

initPage({
  page: 'book',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    const doctor = ctx.data.doctors.find((d) => d.doctorId === state.doctorId);
    if (!doctor) return renderMissingDoctor();
    if (!isRefresh) {
      const today = toISODate(new Date());
      if (!state.date || state.date < today) state.date = nextAvailableSlot(ctx.data, doctor.doctorId)?.date || today;
      bindEvents();
      modal = new window.bootstrap.Modal($('#bookingModal'));
    }
    renderProfile(doctor);
    renderDays(doctor);
    renderSlots(doctor, !isRefresh);
    renderReviews(doctor, !isRefresh);
  },
});
