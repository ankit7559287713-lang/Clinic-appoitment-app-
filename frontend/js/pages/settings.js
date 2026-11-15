// Settings: current role, theme, data counts, reset sample data.
import { initPage, $, escapeHtml, avatar, toast, confirmDialog, sessionPerson } from '../ui/common.js';
import { resetData } from '../logic/storage.js';
import { ROLE_LABELS, HOME_PAGE } from '../logic/roleGuard.js';
import { getSession } from '../ui/session.js';
import { countUp } from '../ui/motion.js';

let ctxRef;


function render(animate) {
  const data = ctxRef.data;
  const session = getSession();
  const person = sessionPerson(session, data);
  $('#roleInfo').innerHTML = person
    ? `<div class="d-flex align-items-center gap-3 mb-3">${avatar(person)}<div><div class="fw-bold">${escapeHtml(person.name)}</div><div class="small text-muted">${ROLE_LABELS[session.role]} · this browser tab</div></div></div>
       <div class="d-flex flex-wrap gap-2"><a class="btn btn-primary" href="${HOME_PAGE[session.role]}"><i class="bi bi-house" aria-hidden="true"></i>Go to my home</a>
       <button class="btn btn-outline-primary" data-action="switch-role"><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Log out</button></div>`
    : `<p class="text-muted">You aren’t signed in on this tab.</p><div class="d-flex flex-wrap gap-2"><a class="btn btn-primary" href="patient-login.html"><i class="bi bi-person-heart" aria-hidden="true"></i>Patient login</a><a class="btn btn-outline-primary" href="doctor-login.html"><i class="bi bi-clipboard2-pulse" aria-hidden="true"></i>Doctor login</a></div>`;

  const counts = [
    ['Doctors', data.doctors.length, 'bi-person-badge'],
    ['Patients', data.patients.length, 'bi-people'],
    ['Slots', data.slots.length, 'bi-calendar3'],
    ['Appointments', data.appointments.length, 'bi-calendar2-check'],
  ];
  $('#dataCounts').innerHTML = counts.map(([l, v, i]) => `<div class="col-6"><div class="p-3 rounded-4 border h-100">
    <div class="small text-muted fw-semibold"><i class="bi ${i} text-turq me-1" aria-hidden="true"></i>${l}</div><div class="h4 mb-0 fw-800" data-v="${v}">${v}</div></div></div>`).join('');
  if (animate) document.querySelectorAll('#dataCounts [data-v]').forEach((el) => countUp(el, Number(el.dataset.v), { duration: 1 }));
  $('#savedAt').textContent = data.savedAt ? `Last saved ${new Date(data.savedAt).toLocaleString()}.` : '';
}

function bindEvents() {
  $('#resetBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset all demo data?',
      body: 'Every booking, slot and patient you added will be replaced with the original sample data. This can’t be undone.',
      confirmText: 'Reset data', cancelText: 'Keep my data', icon: 'bi-arrow-counterclockwise',
    });
    if (!ok) return;
    try {
      resetData();
      toast('Sample data restored.');
      ctxRef.refresh();
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

initPage({
  page: 'settings',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    if (!isRefresh) bindEvents();
    render(!isRefresh);
  },
});
