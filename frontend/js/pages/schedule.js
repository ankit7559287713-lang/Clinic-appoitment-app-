// Doctor: day schedule, mark completed, add/remove slots.
import { initPage, $, $$, escapeHtml, avatar, statusBadge, emptyState, toast, confirmDialog, showFieldErrors, clearFieldErrors, dayLabel } from '../ui/common.js';
import { renderDayStrip } from '../ui/components.js';
import { listSlots, addSlot, removeSlot } from '../logic/slotService.js';
import { completeAppointment, startConsultation } from '../logic/bookingService.js';
import { listEmergencyRequests, updateEmergencyCase } from '../logic/emergencyService.js';
import { doctorQueueEntries } from '../logic/receptionService.js';
import { validateSlotInput, hasErrors } from '../logic/validators.js';
import { toISODate, addDays, parseISODate, formatLongDate, formatTime, timeToMinutes, minutesToTime, toDateTime } from '../logic/dateUtils.js';
import { staggerIn, popIn, countUp, leave, shake } from '../ui/motion.js';

const state = { date: toISODate(new Date()), stripStart: toISODate(addDays(new Date(), -3)), appointmentView: 'today' };
let ctxRef;


const me = () => ctxRef.data.doctors.find((d) => d.doctorId === ctxRef.session.doctorId);

function renderHeader() {
  const d = me();
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#docAvatar').innerHTML = avatar(d, 'avatar-lg');
  $('#docGreeting').textContent = `${greet}, ${d.name}`;
  $('#docSub').innerHTML = `${escapeHtml(d.specialty)} · ${escapeHtml(d.room)} ${d.status !== 'active' ? '· <span class="status-badge status-onleave"><i class="bi bi-airplane" aria-hidden="true"></i>On leave — patients can’t book</span>' : ''}`;
}

function renderAll(animate) {
  renderStrip();
  renderStats(animate);
  renderAppointments(animate);
  renderDoctorQueues();
  renderSlotList(animate);
  renderEmergencyRequests();
}

function renderStrip() {
  const now = new Date();
  const slots = listSlots(ctxRef.data, { doctorId: me().doctorId }, now);
  const appts = ctxRef.data.appointments.filter((a) => a.doctorId === me().doctorId && a.status !== 'Cancelled');
  renderDayStrip($('#dayStrip'), {
    start: state.stripStart, count: 17, selected: state.date, today: toISODate(now),
    meta: (iso) => {
      const n = appts.filter((a) => a.date === iso).length;
      const s = slots.filter((x) => x.date === iso).length;
      if (!s) return { label: 'Off' };
      return { label: n ? `${n} appt${n > 1 ? 's' : ''}` : 'Free', full: s > 0 && n === s };
    },
  });
  $('#datePicker').value = state.date;
}

function dayAppointments() {
  return ctxRef.data.appointments
    .filter((a) => a.doctorId === me().doctorId && a.date === state.date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function renderStats(animate) {
  const appts = dayAppointments();
  const slots = listSlots(ctxRef.data, { doctorId: me().doctorId, date: state.date });
  const stats = [
    { label: 'Booked', v: appts.filter((a) => a.status === 'Booked').length, icon: 'bi-calendar2-check', c: 'turq' },
    { label: 'Open slots', v: slots.filter((s) => s.status === 'Available' && !s.isPast).length, icon: 'bi-calendar2-plus', c: 'grey' },
    { label: 'Completed', v: appts.filter((a) => a.status === 'Completed').length, icon: 'bi-check2-all', c: 'blue' },
    { label: 'Cancelled', v: appts.filter((a) => a.status === 'Cancelled').length, icon: 'bi-x-circle', c: 'red' },
  ];
  $('#dayStats').innerHTML = stats.map((s) => `<div class="col-6 col-md-3"><div class="card stat-card">
    <span class="stat-icon ${s.c}"><i class="bi ${s.icon}" aria-hidden="true"></i></span>
    <div><div class="stat-value" data-v="${s.v}">${s.v}</div><div class="stat-label">${s.label}</div></div></div></div>`).join('');
  if (animate) { staggerIn('#dayStats .stat-card'); $$('#dayStats [data-v]').forEach((el) => countUp(el, Number(el.dataset.v), { duration: 0.9 })); }
}

function renderAppointments(animate) {
  const today = toISODate(new Date());
  const appts = state.appointmentView === 'upcoming'
    ? ctxRef.data.appointments
      .filter((appointment) => appointment.doctorId === me().doctorId && appointment.status === 'Booked' &&
        toDateTime(appointment.date, appointment.startTime) > new Date())
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    : dayAppointments();
  $('#apptTitle').textContent = state.appointmentView === 'upcoming'
    ? 'Upcoming appointments'
    : `${dayLabel(state.date, today)} · ${formatLongDate(state.date)}`;
  const host = $('#dayAppointments');
  if (!appts.length) {
    host.innerHTML = state.appointmentView === 'upcoming'
      ? emptyState({ icon: 'bi-calendar2-x', title: 'No upcoming appointments', text: 'New bookings will appear here.' })
      : emptyState({ icon: 'bi-cup-hot', title: 'No appointments on this day', text: 'Add open slots so patients can book you.', action: '<button class="btn btn-primary" data-focus-add><i class="bi bi-plus-lg" aria-hidden="true"></i>Add slots</button>' });
    return;
  }
  host.innerHTML = `<ol class="timeline">${appts.map((a) => {
    const p = ctxRef.data.patients.find((x) => x.patientId === a.patientId) || { name: 'Unknown', phone: '' };
    const started = toDateTime(a.date, a.startTime) <= new Date();
    return `<li class="timeline-item is-${a.status}" data-id="${a.appointmentId}">
      <div class="timeline-time">${formatTime(a.startTime)}<small>${formatTime(a.blockEndTime || a.endTime)}</small></div>
      <div class="timeline-body">
        <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
          <div class="d-flex align-items-center gap-2 min-w-0">${avatar(p, 'avatar-sm')}<div class="min-w-0"><div class="fw-bold text-truncate">${escapeHtml(p.name)}</div><div class="small text-muted"><i class="bi bi-telephone me-1" aria-hidden="true"></i>${escapeHtml(p.phone)}</div></div></div>
          ${statusBadge(a.status)}
        </div>
        <p class="small mb-2 mt-2"><i class="bi bi-chat-left-text text-turq me-1" aria-hidden="true"></i>${escapeHtml(a.reason)} <span class="text-muted">· Consultation: ${escapeHtml(a.consultationStatus || a.status)}</span></p>
        <a class="btn btn-sm btn-outline-primary me-2" href="patient-record.html?patient=${encodeURIComponent(a.patientId)}&amp;appointment=${encodeURIComponent(a.appointmentId)}"><i class="bi bi-file-medical" aria-hidden="true"></i>Details &amp; clinical record</a>
        ${a.status === 'Booked' && a.consultationStatus !== 'InProgress' ? `<button class="btn btn-sm btn-soft me-2" data-start="${a.appointmentId}"><i class="bi bi-play-fill" aria-hidden="true"></i>Start consultation</button>` : ''}
        ${a.status === 'Booked' ? `<button class="btn btn-sm ${started ? 'btn-primary' : 'btn-soft'}" data-complete="${a.appointmentId}"><i class="bi bi-check2-all" aria-hidden="true"></i>Mark completed</button>` : ''}
      </div></li>`;
  }).join('')}</ol>`;
  if (animate) staggerIn('#dayAppointments .timeline-item', { stagger: 0.07 });
}

function renderDoctorQueues() {
  const entries = doctorQueueEntries(ctxRef.data, me().doctorId);
  const normal = entries.filter((entry) => entry.entryType === 'WalkIn');
  const emergencies = entries.filter((entry) => entry.entryType === 'EmergencyWalkIn');
  const renderEntry = (entry, emergency = false) => {
    const patient = ctxRef.data.patients.find((record) => record.patientId === entry.patientId);
    return `<article class="border rounded-4 p-3 mb-2">
      <div class="d-flex flex-wrap justify-content-between gap-2">
        <strong>${entry.queueNumber ? `#${entry.queueNumber} · ` : ''}${escapeHtml(patient?.name || 'Unknown patient')}</strong>
        <span>${emergency ? '<span class="badge text-bg-danger me-1">EMERGENCY</span>' : ''}${statusBadge(entry.status)}</span>
      </div>
      <div class="small text-muted">Arrived ${new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
      <a class="btn btn-sm btn-primary mt-2" href="patient-record.html?patient=${encodeURIComponent(entry.patientId)}&amp;encounterId=${encodeURIComponent(entry.queueId)}">Open ${emergency ? 'emergency' : 'walk-in'} record</a>
    </article>`;
  };
  $('#doctorWalkInQueue').innerHTML = normal.length
    ? normal.map((entry) => renderEntry(entry)).join('')
    : '<p class="small text-muted mb-0">No assigned walk-in patients are waiting.</p>';
  $('#doctorEmergencyWalkIns').innerHTML = emergencies.length
    ? emergencies.map((entry) => renderEntry(entry, true)).join('')
    : '<p class="small text-muted mb-0">No verified emergency walk-ins are assigned.</p>';
}

function renderSlotList(animate) {
  const slots = listSlots(ctxRef.data, { doctorId: me().doctorId, date: state.date });
  $('#slotCountLabel').textContent = `${slots.length} slot${slots.length === 1 ? '' : 's'}`;
  const host = $('#slotList');
  if (!slots.length) { host.innerHTML = '<li class="small text-muted"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>No slots published for this day.</li>'; return; }
  host.innerHTML = slots.map((s) => {
    const booked = s.status === 'Booked';
    return `<li class="d-flex align-items-center justify-content-between gap-2 p-2 ps-3 rounded-4 border slot-row" data-slot-row="${s.slotId}">
      <span class="fw-semibold ${s.isPast ? 'text-muted' : ''}">${formatTime(s.startTime)} – ${formatTime(s.endTime)}</span>
      <span class="d-flex align-items-center gap-2">
        ${statusBadge(s.isPast && !booked ? 'Past' : s.status)}
        <button class="btn btn-sm btn-light border icon-btn" style="width:36px;height:36px" data-remove="${s.slotId}" ${booked ? 'disabled aria-disabled="true" title="Booked slots can’t be removed"' : 'title="Remove slot"'} aria-label="Remove ${formatTime(s.startTime)} slot${booked ? ' (booked, cannot remove)' : ''}">
          <i class="bi ${booked ? 'bi-lock' : 'bi-trash3'}" aria-hidden="true"></i></button>
      </span></li>`;
  }).join('');
  if (animate) popIn('#slotList .slot-row');
}

function renderEmergencyRequests() {
  const host = $('#emergencyRequests');
  const requests = listEmergencyRequests(ctxRef.data, { doctorId: me().doctorId });
  if (!requests.length) {
    host.innerHTML = '<p class="text-muted mb-0">No emergency requests.</p>';
    return;
  }
  host.innerHTML = requests.map((request) => {
    const patient = ctxRef.data.patients.find((entry) => entry.patientId === request.patientId);
    const slot = request.slotId && ctxRef.data.slots.find((entry) => entry.slotId === request.slotId);
    const hasRecord = (ctxRef.data.consultations || []).some((record) =>
      record.encounterId === request.requestId && record.patientId === request.patientId && record.doctorId === request.doctorId,
    );
    return `<article class="border rounded-4 p-3 mb-2" data-emergency="${request.requestId}">
      <div class="d-flex flex-wrap justify-content-between gap-2"><strong><span class="badge text-bg-danger me-1">EMERGENCY</span>${escapeHtml(patient?.name || 'Unknown patient')}</strong>${statusBadge(request.status)}</div>
      <p class="small mb-2 mt-2">${escapeHtml(request.reason)}</p>
      ${slot ? `<p class="small text-muted mb-2">Buffer assigned: ${formatLongDate(slot.date)}, ${formatTime(slot.emergencyBufferStartTime)}–${formatTime(slot.emergencyBufferEndTime)}</p>` : ''}
      <a class="btn btn-sm btn-primary me-2" href="patient-record.html?patient=${encodeURIComponent(request.patientId)}&amp;encounterId=${encodeURIComponent(request.requestId)}">Open emergency patient record</a>
      ${request.status === 'In Progress' && hasRecord ? `<button type="button" class="btn btn-sm btn-outline-success" data-complete-emergency="${escapeHtml(request.requestId)}">Complete emergency case</button>` : ''}
    </article>`;
  }).join('');
}

function renderAppointmentViewButtons() {
  document.querySelectorAll('[data-appointment-view]').forEach((button) => {
    const active = button.dataset.appointmentView === state.appointmentView;
    button.className = `btn ${active ? 'btn-primary' : 'btn-soft'}`;
  });
}

function setDate(iso) {
  state.date = iso;
  state.appointmentView = 'today';
  renderAppointmentViewButtons();
  const d = parseISODate(iso);
  const start = parseISODate(state.stripStart);
  const diff = Math.round((d - start) / 86400000);
  if (diff < 0 || diff > 16) state.stripStart = toISODate(addDays(d, -3));
  if (iso >= toISODate(new Date())) $('#slotDate').value = iso;
  renderAll(true);
}

function bindEvents() {
  $('#main').addEventListener('click', (e) => {
    const view = e.target.closest('[data-appointment-view]');
    if (view) {
      state.appointmentView = view.dataset.appointmentView;
      renderAppointmentViewButtons();
      renderAppointments(true);
      return;
    }
    if (e.target.closest('[data-focus-add]')) $('#slotStart').focus();
  });
  $('#dayStrip').addEventListener('click', (e) => { const c = e.target.closest('[data-date]'); if (c) setDate(c.dataset.date); });
  $('#datePicker').addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
  $('#emergencyRequests').addEventListener('click', (e) => {
    const complete = e.target.closest('[data-complete-emergency]');
    if (complete) {
      const result = updateEmergencyCase({ requestId: complete.dataset.completeEmergency, status: 'Completed', actor: ctxRef.session });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Emergency case completed.', 'success');
      ctxRef.refresh();
    }
  });

  $('#dayAppointments').addEventListener('click', async (e) => {
    const start = e.target.closest('[data-start]');
    if (start) {
      const result = startConsultation({ appointmentId: start.dataset.start, actor: ctxRef.session });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Consultation started.', 'success');
      ctxRef.refresh();
      return;
    }
    const btn = e.target.closest('[data-complete]');
    if (!btn) return;
    const res = completeAppointment({ appointmentId: btn.dataset.complete, actor: ctxRef.session });
    if (!res.ok) { toast(res.message, 'danger'); ctxRef.refresh(); return; }
    toast('Marked as completed.');
    ctxRef.refresh();
  });

  $('#slotList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn || btn.disabled) return;
    const slot = ctxRef.data.slots.find((s) => s.slotId === btn.dataset.remove);
    const ok = await confirmDialog({ title: 'Remove this slot?', body: `${formatLongDate(slot.date)}<br><strong>${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}</strong>`, confirmText: 'Remove slot', cancelText: 'Keep slot', icon: 'bi-trash3' });
    if (!ok) return;
    const res = removeSlot({ slotId: slot.slotId, actor: ctxRef.session });
    if (!res.ok) { toast(res.message, 'danger'); ctxRef.refresh(); return; }
    toast('Slot removed.');
    leave(btn.closest('.slot-row'), () => ctxRef.refresh());
  });

  $('#slotForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const date = $('#slotDate').value;
    const startTime = $('#slotStart').value;
    const duration = Number($('#slotDuration').value);
    const count = Number($('#slotCount').value);
    const alertBox = $('#slotAlert');
    alertBox.innerHTML = '';
    const errors = validateSlotInput({ date, startTime, duration });
    if (!errors.duration && startTime && timeToMinutes(startTime) + duration * count >= 24 * 60) errors.duration = 'These slots would run past midnight. Use fewer slots or an earlier time.';
    if (hasErrors(errors)) { showFieldErrors(form, errors); shake(form); return; }
    clearFieldErrors(form);

    const added = [];
    const skipped = [];
    for (let i = 0; i < count; i++) {
      const t = minutesToTime(timeToMinutes(startTime) + i * duration);
      const res = addSlot({ doctorId: me().doctorId, date, startTime: t, duration, actor: ctxRef.session });
      if (res.ok) added.push(t); else skipped.push(`${formatTime(t)}: ${res.message}`);
    }
    if (added.length) toast(`Added ${added.length} slot${added.length > 1 ? 's' : ''} on ${formatLongDate(date)}.`);
    if (skipped.length) {
      alertBox.innerHTML = `<div class="alert alert-warning rounded-4 small" role="alert"><strong><i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>${skipped.length} slot${skipped.length > 1 ? 's' : ''} not added</strong><ul class="mb-0 ps-3 mt-1">${skipped.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`;
      if (!added.length) shake(form);
    }
    if (added.length) {
      const nextStart = timeToMinutes(startTime) + duration * count;
      if (nextStart < 24 * 60) $('#slotStart').value = minutesToTime(nextStart);
      ctxRef.refresh();
      if (date !== state.date) setDate(date);
    }
  });
}

initPage({
  page: 'schedule',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    if (!isRefresh) { bindEvents(); $('#slotDate').value = state.date; $('#slotDate').min = toISODate(new Date()); }
    renderHeader();
    renderAppointmentViewButtons();
    renderAll(!isRefresh);
  },
});
