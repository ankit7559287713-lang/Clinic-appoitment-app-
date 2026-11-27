// Patient login and Doctor login pages share this script. The page's role comes
// from <body data-login-role="patient|doctor|receptionist">.
import { initPage, $, $$, escapeHtml, avatar, showFieldErrors, clearFieldErrors, sessionPerson } from '../ui/common.js';
import { setSession, getSession } from '../ui/session.js';
import { HOME_PAGE, ROLE_LABELS } from '../logic/roleGuard.js';
import { loginPatient, loginDoctor, loginReceptionist } from '../logic/authService.js';
import { canAnimate, shake, popIn } from '../ui/motion.js';

const role = ['patient', 'doctor', 'receptionist'].includes(document.body.dataset.loginRole) ? document.body.dataset.loginRole : 'patient';
let ctxRef;
let submitting = false;
let loginButtonMarkup = '';

function renderContinue() {
  const session = getSession();
  const person = sessionPerson(session, ctxRef.data);
  $('#continueBox').innerHTML = person
    ? `<div class="booking-for-banner d-flex flex-wrap align-items-center gap-2 mb-4">
        <div class="flex-grow-1 small">Signed in as <strong>${escapeHtml(person.name)}</strong> (${ROLE_LABELS[session.role]}).</div>
        <a class="btn btn-sm btn-primary" href="${HOME_PAGE[session.role]}">Continue <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
      </div>`
    : '';
}

function renderDemoAccounts(animate) {
  const { data } = ctxRef;
  const accounts = role === 'patient'
    ? data.patients.map((p) => ({ person: p, id: p.phone, sub: p.phone }))
    : role === 'doctor' ? data.doctors.map((d) => ({ person: d, id: d.staffId, sub: d.staffId })) : (data.receptionists || []).map((r) => ({ person: r, id: r.staffId, sub: r.staffId }));
  $('#demoAccounts').innerHTML = accounts.map((a) => `<div class="col">
    <button type="button" class="demo-account" data-identifier="${escapeHtml(a.id)}" aria-label="Sign in as ${escapeHtml(a.person.name)}">
      ${avatar(a.person, 'avatar-sm')}
      <span class="min-w-0 text-start"><span class="d-block fw-semibold text-truncate">${escapeHtml(a.person.name)}</span><span class="d-block small text-muted text-truncate">${escapeHtml(a.sub)}</span></span>
    </button></div>`).join('');
  if (animate) popIn('#demoAccounts .demo-account', { delay: 0.5, stagger: 0.05 });
}

function signIn(identifier) {
  if (submitting) return;
  const form = $('#loginForm');
  const btn = $('#loginBtn');
  submitting = true;

  try {
    form.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Signing in…';
    $('#identifier').disabled = true;
    $$('#demoAccounts [data-identifier]').forEach((account) => { account.disabled = true; });

    const res = role === 'patient' ? loginPatient(ctxRef.data, identifier) : role === 'doctor' ? loginDoctor(ctxRef.data, identifier) : loginReceptionist(ctxRef.data, identifier);
    if (!res.ok) {
      showFieldErrors(form, { identifier: res.message });
      shake($('#authCard'));
      return;
    }
    clearFieldErrors(form);
    if (!setSession(res.session)) {
      showFieldErrors(form, { identifier: 'Your sign-in session could not be saved. Check browser storage and try again.' });
      return;
    }
    window.location.href = HOME_PAGE[role];
  } finally {
    submitting = false;
    form.removeAttribute('aria-busy');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = loginButtonMarkup;
    $('#identifier').disabled = false;
    $$('#demoAccounts [data-identifier]').forEach((account) => { account.disabled = false; });
  }
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); signIn($('#identifier').value); });
  $('#identifier').addEventListener('input', () => clearFieldErrors($('#loginForm')));
  $('#demoAccounts').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-identifier]');
    if (!btn) return;
    $('#identifier').value = btn.dataset.identifier;
    signIn(btn.dataset.identifier);
  });
}

function animateIn() {
  if (!canAnimate()) return;
  const gs = window.gsap;
  gs.timeline({ delay: 0.2, defaults: { ease: 'power3.out' } })
    .fromTo('.auth-panel', { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.7, clearProps: 'transform,opacity,visibility' })
    .fromTo('#authCard', { x: 50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.7, clearProps: 'transform,opacity,visibility' }, '<')
    .fromTo('.panel-anim', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55, stagger: 0.09, clearProps: 'opacity,visibility' }, '-=0.35')
    .fromTo('#authCard > *:not(#continueBox)', { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.05, clearProps: 'transform,opacity,visibility' }, '-=0.9');
  gs.to('#authFloat', { y: -10, duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.6 });
  gs.to('.auth-glow-1', { x: 40, y: 30, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gs.to('.auth-glow-2', { x: -30, y: -40, duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

initPage({
  page: `${role}-login`,
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    loginButtonMarkup = $('#loginBtn').innerHTML;
    renderContinue();
    renderDemoAccounts(!isRefresh);
    if (!isRefresh) { bindEvents(); animateIn(); }
  },
});
