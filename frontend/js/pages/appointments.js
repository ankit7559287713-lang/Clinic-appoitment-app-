// Patient: appointments, cancellation history, emergency request status, clinical records.
import { initPage, $, $$, escapeHtml, statusBadge, dateBlock, timeRange, emptyState, toast, confirmDialog } from '../ui/common.js';
import { cancelAppointment, classifyAppointments } from '../logic/bookingService.js';
import { patientClinicalRecords } from '../logic/consultationService.js';
import { listEmergencyRequests } from '../logic/emergencyService.js';
import { formatLongDate, formatDate, formatTime } from '../logic/dateUtils.js';
import { staggerIn, leave, countUp } from '../ui/motion.js';

const state = { tab: 'upcoming' };
let ctxRef;


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

  renderEmergencyRequests();

  const tabs = [
    { id: 'upcoming', label: 'Upcoming', icon: 'bi-calendar2-week', n: upcoming.length },
    { id: 'past', label: 'Past', icon: 'bi-clock-history', n: past.length },
    { id: 'cancelled', label: 'Cancelled', icon: 'bi-x-circle', n: cancelled.length },
    { id: 'records', label: 'Clinical records', icon: 'bi-file-medical', n: patientRecords().length },
  ];
  $('#apptTabs').innerHTML = tabs.map((t) => `<li class="nav-item" role="presentation">
    <button class="btn ${t.id === state.tab ? 'btn-primary' : 'btn-soft'}" role="tab" aria-selected="${t.id === state.tab}" data-tab="${t.id}">
      <i class="bi ${t.icon}" aria-hidden="true"></i>${t.label} <span class="badge rounded-pill ${t.id === state.tab ? 'text-bg-light' : 'bg-primary'}" data-n="${t.n}">${t.n}</span></button></li>`).join('');
  if (animate) $$('[data-n]').forEach((el) => countUp(el, Number(el.dataset.n), { duration: 0.8 }));

  const items = { upcoming, past, cancelled }[state.tab];
  const host = $('#apptList');
  if (state.tab === 'records') {
    renderPatientRecords(animate);
    return;
  }
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
  return `<article class="card appt-card ${a.status === 'Cancelled' ? 'is-cancelled' : ''}" data-id="${a.appointmentId}" aria-label="${escapeHtml(doc.name)}, ${formatLongDate(a.date)}">
    ${dateBlock(a.date)}
    <div class="flex-grow-1 min-w-0">
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
        <h3 class="h6 mb-0">${escapeHtml(doc.name)} <span class="text-muted fw-normal small">· ${escapeHtml(doc.specialty)}</span></h3>
        <span>${a.isEmergency ? '<span class="badge text-bg-danger me-1">EMERGENCY</span>' : ''}${statusBadge(displayStatus)}</span>
      </div>
      <div class="small fw-semibold mb-1"><i class="bi bi-clock text-turq me-1" aria-hidden="true"></i>${timeRange(a)} <span class="text-muted fw-normal ms-2"><i class="bi bi-door-open me-1" aria-hidden="true"></i>${escapeHtml(doc.room || '')}</span></div>
      <p class="small text-muted mb-2 text-truncate-2"><i class="bi bi-chat-left-text me-1" aria-hidden="true"></i>${escapeHtml(a.reason)}</p>
      <div class="d-flex flex-wrap gap-2">
        ${canCancel ? `<button class="btn btn-sm btn-outline-danger" data-cancel="${a.appointmentId}"><i class="bi bi-x-circle" aria-hidden="true"></i>Cancel</button>` : ''}
        ${state.tab !== 'upcoming' ? `<a class="btn btn-sm btn-soft" href="book.html?doctor=${a.doctorId}"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Book again</a>` : ''}
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

function patientRecords() {
  const result = patientClinicalRecords(ctxRef.data, ctxRef.session.patientId, ctxRef.session);
  return result.ok ? result.records : [];
}

function renderPatientRecords(animate) {
  const records = patientRecords();
  const host = $('#apptList');
  if (!records.length) {
    host.innerHTML = `<div class="card">${emptyState({ icon: 'bi-file-medical', title: 'No completed clinical records', text: 'Completed consultation notes and prescriptions will appear here when available.' })}</div>`;
    return;
  }
  host.innerHTML = `<div class="d-grid gap-3">${records.map(({ appointment, encounter, consultation, prescriptions, doctor }) => {
    const visitDate = appointment?.date || String(consultation.createdAt).slice(0, 10);
    const visitDetail = appointment?.reason || encounter?.reason || consultation.chiefComplaint || consultation.encounterType || 'Clinic visit';
    return `<article class="card p-3 appt-card">
      ${dateBlock(visitDate)}
      <div class="flex-grow-1 min-w-0">
        <h3 class="h6">${escapeHtml(doctor?.name || 'Doctor')} · ${formatLongDate(visitDate)}</h3>
        <p class="small text-muted">${escapeHtml(visitDetail)}</p>
        <h4 class="h6">Consultation notes</h4>
        <p class="mb-3">${escapeHtml(consultation?.notes || 'No notes were recorded for this visit.')}</p>
        <h4 class="h6">Prescriptions</h4>
        ${prescriptions.length ? `<ul class="mb-0">${prescriptions.map((medicine) => `<li><strong>${escapeHtml(medicine.medicineName)}</strong> — ${escapeHtml(medicine.dosage)}, ${escapeHtml(medicine.frequency)}, ${escapeHtml(medicine.duration)}. ${escapeHtml(medicine.instructions)}</li>`).join('')}</ul>` : '<p class="small text-muted mb-0">No medicines prescribed.</p>'}
      </div>
    </article>`;
  }).join('')}</div>`;
  if (animate) staggerIn('#apptList .appt-card');
}

function renderEmergencyRequests() {
  const requests = listEmergencyRequests(ctxRef.data, { patientId: ctxRef.session.patientId });
  $('#emergencyRequestHistory').innerHTML = requests.length
    ? requests.map((request) => {
      const appointment = ctxRef.data.appointments.find((entry) =>
        entry.appointmentId === request.appointmentId || entry.emergencyRequestId === request.requestId,
      );
      const slot = ctxRef.data.slots.find((entry) => entry.slotId === (appointment?.slotId || request.slotId));
      const doctor = doctorOf({ doctorId: request.doctorId });
      const date = appointment?.date || slot?.date;
      const start = appointment?.startTime || slot?.emergencyBufferStartTime || slot?.consultationEndTime;
      const end = appointment?.endTime || slot?.emergencyBufferEndTime || slot?.endTime;
      const message = request.status === 'pending_approval'
        ? 'Your emergency request has been submitted. It is waiting for receptionist approval. Your appointment is not confirmed yet.'
        : ['Approved', 'In Progress', 'Completed'].includes(request.status)
          ? 'Your emergency appointment has been approved and confirmed successfully!'
          : request.status === 'rejected'
            ? 'Your emergency appointment request was not approved. Please contact reception for assistance.'
            : request.legacyDecision
              ? 'This is a legacy emergency request from an earlier version of ClinicBook.'
              : `Emergency request status: ${request.status}.`;
      return `<div class="border rounded-4 p-3 mb-2">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <strong>${escapeHtml(doctor.name)}</strong>${statusBadge(request.status)}
        </div>
        ${date && start && end ? `<div class="small mt-1">${formatLongDate(date)} · ${formatTime(start)}–${formatTime(end)}</div>` : ''}
        <div class="small text-muted mt-1">${escapeHtml(request.reason)}</div>
        <p class="mb-0 mt-2">${escapeHtml(message)}</p>
      </div>`;
    }).join('')
    : '<p class="small text-muted mb-0">No emergency requests.</p>';
}

initPage({
  page: 'appointments',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    if (!isRefresh) bindEvents();
    render(!isRefresh);
  },
});
