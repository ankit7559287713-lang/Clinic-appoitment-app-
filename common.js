// Shared UI: page bootstrapping, navbar, footer, toasts, confirm dialog,
// status badges and small render helpers used by every page.
import { loadData, resetData, DATA_KEY } from '../logic/storage.js';
import { canAccessPage, HOME_PAGE, LOGIN_PAGE, ROLE_LABELS, roleForPage } from '../logic/roleGuard.js';
import { formatDate, formatTime, parseISODate } from '../logic/dateUtils.js';
import { getSession, clearSession } from './session.js';
import { hideLoader, pageIn, slideToast, staggerIn } from './motion.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
  return name.replace(/^Dr\.\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#40e0d0,#0b8076)',
  'linear-gradient(135deg,#67e0d3,#0e9f92)',
  'linear-gradient(135deg,#1cc2b2,#0b4f4a)',
  'linear-gradient(135deg,#5eead4,#2563eb)',
  'linear-gradient(135deg,#40e0d0,#6366f1)',
  'linear-gradient(135deg,#a0efe6,#0b8076)',
];
export function avatar(person, cls = '') {
  const id = person.doctorId || person.patientId || person.name;
  const idx = [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length;
  return `<span class="avatar ${cls}" style="background:${AVATAR_GRADIENTS[idx]}" aria-hidden="true">${escapeHtml(initials(person.name))}</span>`;
}

const STATUS_ICON = {
  Booked: 'bi-calendar2-check',
  Available: 'bi-check-circle',
  Cancelled: 'bi-x-circle',
  Completed: 'bi-check2-all',
  Past: 'bi-clock-history',
};
export function statusBadge(status) {
  return `<span class="status-badge status-${status}"><i class="bi ${STATUS_ICON[status] || 'bi-dot'}" aria-hidden="true"></i>${status}</span>`;
}

export function dateBlock(iso) {
  const d = parseISODate(iso);
  return `<div class="date-block" aria-hidden="true">
    <span class="m">${d.toLocaleDateString('en-US', { month: 'short' })}</span>
    <span class="d">${d.getDate()}</span>
    <span class="w">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
  </div>`;
}

export const timeRange = (a) => `${formatTime(a.startTime)} – ${formatTime(a.endTime)}`;
export const whenText = (a) => `${formatDate(a.date)} · ${timeRange(a)}`;

export function emptyState({ icon = 'bi-calendar2-x', title, text = '', action = '' }) {
  return `<div class="empty-state" role="status">
    <div class="empty-icon"><i class="bi ${icon}" aria-hidden="true"></i></div>
    <h3 class="h5 mb-2">${title}</h3>
    ${text ? `<p class="text-muted mb-3 mx-auto" style="max-width:28rem">${text}</p>` : ''}
    ${action}
  </div>`;
}

/* ---------------- theme ---------------- */
// ClinicBook uses a single whitesmoke (light) theme.
export function applyTheme() {
  document.documentElement.setAttribute('data-bs-theme', 'light');
}

/* ---------------- navbar & footer ---------------- */
const NAV = {
  patient: [
    { page: 'doctors', href: 'doctors.html', label: 'Find a Doctor', icon: 'bi-search-heart' },
    { page: 'appointments', href: 'appointments.html', label: 'My Appointments', icon: 'bi-calendar2-check' },
  ],
  doctor: [{ page: 'schedule', href: 'schedule.html', label: 'My Schedule', icon: 'bi-calendar-week' }],
  guest: [
    { page: 'how', href: 'index.html#how', label: 'How it works', icon: 'bi-lightning-charge' },
    { page: 'patient-login', href: 'patient-login.html', label: 'Patient login', icon: 'bi-person-heart' },
    { page: 'doctor-login', href: 'doctor-login.html', label: 'Doctor login', icon: 'bi-clipboard2-pulse' },
  ],
};

export function sessionPerson(session, data) {
  if (!session || !data) return null;
  if (session.role === 'patient') return data.patients.find((p) => p.patientId === session.patientId) || null;
  if (session.role === 'doctor') return data.doctors.find((d) => d.doctorId === session.doctorId) || null;
  return null;
}

function renderNavbar(page, session, data) {
  const host = $('#app-nav');
  if (!host) return;
  const links = NAV[session?.role] || NAV.guest;
  const person = sessionPerson(session, data);
  host.innerHTML = `
  <nav class="navbar navbar-expand-xl cb-navbar sticky-top" aria-label="Main">
    <div class="container">
      <a class="navbar-brand" href="${session ? HOME_PAGE[session.role] : 'index.html'}">
        <span class="brand-mark"><i class="bi bi-heart-pulse-fill" aria-hidden="true"></i></span>
        <span>Clinic<span class="brand-accent">Book</span></span>
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#cbNav" aria-controls="cbNav" aria-expanded="false" aria-label="Toggle navigation">
        <i class="bi bi-list fs-4" aria-hidden="true"></i>
      </button>
      <div class="collapse navbar-collapse" id="cbNav">
        <ul class="navbar-nav me-auto ms-xl-4 gap-xl-1 mt-3 mt-xl-0">
          ${links.map((l) => `<li class="nav-item"><a class="nav-link ${l.page === page ? 'active' : ''}" ${l.page === page ? 'aria-current="page"' : ''} href="${l.href}"><i class="bi ${l.icon}" aria-hidden="true"></i>${l.label}</a></li>`).join('')}
          <li class="nav-item"><a class="nav-link ${page === 'settings' ? 'active' : ''}" ${page === 'settings' ? 'aria-current="page"' : ''} href="settings.html"><i class="bi bi-gear" aria-hidden="true"></i>Settings</a></li>
        </ul>
        <div class="d-flex flex-wrap align-items-center gap-2 py-3 py-xl-0">
          ${person ? `<span class="role-chip">${avatar(person)}<span class="text-truncate">${escapeHtml(person.name)} <small>· ${ROLE_LABELS[session.role]}</small></span></span>` : ''}
          ${session
            ? `<button type="button" class="btn btn-outline-primary" data-action="switch-role"><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Log out</button>`
            : `<a class="btn btn-primary" href="index.html#roles"><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>Get started</a>`}
        </div>
      </div>
    </div>
  </nav>`;
}

function renderFooter() {
  const host = $('#app-footer');
  if (!host) return;
  host.innerHTML = `
  <footer class="cb-footer">
    <div class="container d-flex flex-column flex-md-row gap-2 justify-content-between align-items-md-center">
      <div class="d-flex align-items-center gap-2"><span class="brand-mark" style="width:28px;height:28px;border-radius:9px;font-size:.8rem"><i class="bi bi-heart-pulse-fill" aria-hidden="true"></i></span>
        <span><strong>ClinicBook</strong> · Demo app. All patients and doctors are fictional.</span></div>
      <div><i class="bi bi-shield-check text-turq" aria-hidden="true"></i> Please don’t enter real health information.</div>
    </div>
  </footer>`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'switch-role') { clearSession(); window.location.href = 'index.html#roles'; }
});

/* ---------------- toasts ---------------- */
const TOAST_ICON = { success: 'bi-check-circle-fill', danger: 'bi-exclamation-octagon-fill', info: 'bi-arrow-repeat', warning: 'bi-exclamation-triangle-fill' };
export function toast(message, variant = 'success') {
  let box = $('#toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    box.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast cb-toast ${variant}`;
  el.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
  el.setAttribute('aria-live', variant === 'danger' ? 'assertive' : 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = `<div class="toast-body">
      <span class="toast-icon"><i class="bi ${TOAST_ICON[variant] || TOAST_ICON.info}" aria-hidden="true"></i></span>
      <span class="flex-grow-1 pt-1">${escapeHtml(message)}</span>
      <button type="button" class="btn-close ms-2" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  box.appendChild(el);
  const t = new window.bootstrap.Toast(el, { delay: 5000 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
  slideToast(el);
}

/* ---------------- confirm dialog ---------------- */
export function confirmDialog({ title, body, confirmText = 'Confirm', cancelText = 'Keep it', variant = 'danger', icon = 'bi-exclamation-triangle' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="modal fade" tabindex="-1" aria-labelledby="cbConfirmTitle" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-body text-center p-4">
            <div class="empty-icon mx-auto mb-3" style="width:64px;height:64px;border-radius:20px;display:grid;place-items:center;font-size:1.6rem;background:var(--cb-${variant === 'danger' ? 'cancelled' : 'available'}-bg);color:var(--cb-${variant === 'danger' ? 'cancelled' : 'available'})"><i class="bi ${icon}" aria-hidden="true"></i></div>
            <h2 class="h5" id="cbConfirmTitle">${title}</h2>
            <div class="text-muted">${body}</div>
          </div>
          <div class="modal-footer justify-content-center gap-2">
            <button type="button" class="btn btn-light border" data-bs-dismiss="modal">${cancelText}</button>
            <button type="button" class="btn btn-${variant}" data-confirm>${confirmText}</button>
          </div>
        </div>
      </div>
    </div>`;
    const el = wrap.firstElementChild;
    document.body.appendChild(el);
    const modal = new window.bootstrap.Modal(el);
    let result = false;
    el.querySelector('[data-confirm]').addEventListener('click', () => { result = true; modal.hide(); });
    el.addEventListener('shown.bs.modal', () => el.querySelector('[data-bs-dismiss]').focus());
    el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(result); });
    modal.show();
  });
}

/* ---------------- form helpers ---------------- */
export function showFieldErrors(form, errors) {
  $$('.is-invalid', form).forEach((el) => { el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); });
  let first = null;
  for (const [field, msg] of Object.entries(errors || {})) {
    const input = form.querySelector(`[name="${field}"]`);
    if (!input) continue;
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    const fb = form.querySelector(`#${input.id}-error`);
    if (fb) fb.textContent = msg;
    first ??= input;
  }
  first?.focus();
  return Boolean(first);
}
export function clearFieldErrors(form) { showFieldErrors(form, {}); }

/* ---------------- page bootstrap ---------------- */
function renderStateCard(main, html) {
  main.innerHTML = `<div class="container py-5"><div class="card mx-auto" style="max-width:560px">${html}</div></div>`;
  staggerIn(main.querySelector('.card'));
}

function renderUnauthorized(main, session, page) {
  if (session) {
    renderStateCard(main, emptyState({
      icon: 'bi-shield-lock',
      title: `${ROLE_LABELS[session.role]}s can’t open this page`,
      text: 'Your current login doesn’t have access to this screen. Log out and sign in with the other login to continue.',
      action: `<div class="d-flex gap-2 justify-content-center flex-wrap">
        <a class="btn btn-primary" href="${HOME_PAGE[session.role]}"><i class="bi bi-house" aria-hidden="true"></i>Go to my home</a>
        <button class="btn btn-outline-primary" data-action="switch-role"><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Log out</button>
      </div>`,
    }));
    return;
  }
  // Signed out: send the visitor to the login page for this screen's role.
  const role = roleForPage(page);
  renderStateCard(main, emptyState({
    icon: 'bi-box-arrow-in-right',
    title: 'Please sign in first',
    text: role ? `This page is for ${ROLE_LABELS[role].toLowerCase()}s. Sign in to continue.` : 'Sign in as a patient or a doctor to continue.',
    action: `<div class="d-flex gap-2 justify-content-center flex-wrap">
      ${role
        ? `<a class="btn btn-primary" href="${LOGIN_PAGE[role]}"><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>${ROLE_LABELS[role]} login</a>`
        : `<a class="btn btn-primary" href="${LOGIN_PAGE.patient}">Patient login</a><a class="btn btn-outline-primary" href="${LOGIN_PAGE.doctor}">Doctor login</a>`}
      <a class="btn btn-light border" href="index.html"><i class="bi bi-house" aria-hidden="true"></i>Home</a>
    </div>`,
  }));
}

function renderStorageError(main, err) {
  renderStateCard(main, emptyState({
    icon: 'bi-database-exclamation',
    title: 'We couldn’t read the clinic data',
    text: `${escapeHtml(err.message)} You can reset the demo to its sample data.`,
    action: '<button class="btn btn-primary" id="resetAfterError"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Reset sample data</button>',
  }));
  $('#resetAfterError')?.addEventListener('click', () => {
    try { resetData(); window.location.reload(); } catch (e) { toast(e.message, 'danger'); }
  });
}

/**
 * Bootstraps a page: theme, navbar, role guard, data load, cross-tab refresh.
 * render(ctx) is called on load and again whenever data changes.
 */
export function initPage({ page, render }) {
  applyTheme();
  let session = getSession();
  // Sessions for roles that no longer exist (e.g. the removed Front Desk) start over.
  if (session && !HOME_PAGE[session.role]) { clearSession(); session = null; }
  const main = $('#main');
  let data = null;
  try {
    data = loadData();
  } catch (err) {
    renderNavbar(page, session, null);
    renderFooter();
    renderStorageError(main, err);
    hideLoader();
    return;
  }
  renderNavbar(page, session, data);
  renderFooter();

  const allowed = canAccessPage(session?.role ?? null, page);
  // A session whose patient/doctor no longer exists (e.g. after a data reset) must pick a role again.
  const personMissing = session && !sessionPerson(session, data) && !['home', 'settings', 'patient-login', 'doctor-login'].includes(page);
  if (!allowed || personMissing) {
    renderUnauthorized(main, allowed ? null : session, page);
    hideLoader();
    pageIn();
    return;
  }

  const ctx = {
    session,
    actor: session,
    page,
    get data() { return data; },
    refresh() {
      try { data = loadData(); } catch (err) { renderStorageError(main, err); return; }
      render(ctx, { isRefresh: true });
    },
  };

  render(ctx, { isRefresh: false });

  // Another tab changed the data: re-render so availability is never stale.
  window.addEventListener('storage', (e) => {
    if (e.key === DATA_KEY || e.key === null) {
      ctx.refresh();
      toast('Schedule updated in another tab — showing the latest availability.', 'info');
    }
  });

  hideLoader();
  pageIn();
  return ctx;
}

export function dayLabel(iso, todayIso) {
  if (iso === todayIso) return 'Today';
  const d = parseISODate(iso);
  const t = parseISODate(todayIso);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDate(iso);
}
