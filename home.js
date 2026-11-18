// Landing page: hero animation, live stats and links to the two login pages.
import { initPage, $, $$, escapeHtml } from '../ui/common.js';
import { getSession } from '../ui/session.js';
import { HOME_PAGE, ROLE_LABELS } from '../logic/roleGuard.js';
import { listSlots } from '../logic/slotService.js';
import { toISODate, addDays, toDateTime } from '../logic/dateUtils.js';
import { canAnimate, countUp } from '../ui/motion.js';


function renderContinue(data) {
  const s = getSession();
  const box = $('#continueBox');
  if (!s) { box.innerHTML = ''; return; }
  const who = s.role === 'patient' ? data.patients.find((p) => p.patientId === s.patientId)?.name
    : s.role === 'doctor' ? data.doctors.find((d) => d.doctorId === s.doctorId)?.name : null;
  if (!who) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="booking-for-banner d-flex flex-wrap align-items-center gap-3 mb-4">
    <i class="bi bi-person-check fs-4 text-turq" aria-hidden="true"></i>
    <div class="flex-grow-1">You’re signed in to this tab as <strong>${escapeHtml(who)}</strong> (${ROLE_LABELS[s.role]}).</div>
    <a class="btn btn-primary" href="${HOME_PAGE[s.role]}">Continue <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
  </div>`;
}

function setupStats(data) {
  const now = new Date();
  const today = toISODate(now);
  const weekEnd = toISODate(addDays(now, 7));
  const open = listSlots(data, {}, now).filter((s) => s.date >= today && s.date < weekEnd && s.status === 'Available' && !s.isPast).length;
  const booked = data.appointments.filter((a) => a.status === 'Booked' && toDateTime(a.date, a.startTime) > now).length;
  const values = { doctors: data.doctors.length, open, booked, double: 0 };
  const band = $('.stats-band');
  const run = () => $$('[data-count]').forEach((el, i) => countUp(el, values[el.dataset.count], { delay: i * 0.1 }));
  if (canAnimate() && window.ScrollTrigger) {
    window.ScrollTrigger.create({ trigger: band, start: 'top 90%', once: true, onEnter: run });
  } else {
    $$('[data-count]').forEach((el) => { el.textContent = values[el.dataset.count]; });
  }
}

function animateHero() {
  // Mock date chips
  const days = $('#mockDays');
  const base = new Date();
  days.innerHTML = [0, 1, 2, 3].map((i) => {
    const d = addDays(base, i);
    return `<div class="day-chip ${i === 1 ? 'active' : ''}" style="width:auto;flex:1;min-height:64px">
      <span class="dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="dom" style="font-size:1.1rem">${d.getDate()}</span></div>`;
  }).join('');

  if (!canAnimate()) return;
  const gs = window.gsap;
  const tl = gs.timeline({ delay: 0.35, defaults: { ease: 'power3.out' } });
  tl.from('.hero-badge', { y: 20, autoAlpha: 0, duration: 0.5 })
    .from('#heroTitle .word', { yPercent: 110, autoAlpha: 0, rotate: 4, duration: 0.7, stagger: 0.06 }, '-=0.2')
    .from('.hero .lead, .hero .hero-anim:not(.hero-badge)', { y: 18, autoAlpha: 0, duration: 0.6, stagger: 0.1 }, '-=0.4')
    .from('.mock-card', { y: 60, rotate: -3, autoAlpha: 0, duration: 0.9, ease: 'expo.out' }, 0.3)
    .from('.mock-ring', { scale: 0.85, autoAlpha: 0, duration: 1 }, 0.5)
    .fromTo('#mockDays .day-chip', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.07, duration: 0.4, clearProps: 'transform,opacity,visibility' }, 0.8)
    .fromTo('#mockSlots .mock-slot', { scale: 0.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: 0.05, duration: 0.4, ease: 'back.out(2)', clearProps: 'transform,opacity,visibility' }, 0.95)
    .from('#pillGuard', { x: -40, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.6)' }, 1.3);

  // Looping "booking" demo: pick a slot → confirm → booked pill.
  const pick = $('#mockPick');
  const loop = gs.timeline({ repeat: -1, repeatDelay: 1.6, delay: 2 });
  loop.set('#pillConfirm', { autoAlpha: 0, y: 20 })
    .to(pick, { scale: 1.08, duration: 0.2, ease: 'power2.out', onStart: () => pick.classList.add('picked') })
    .to(pick, { scale: 1, duration: 0.25, ease: 'back.out(3)' })
    .to('#mockBtn', { scale: 0.92, duration: 0.12, yoyo: true, repeat: 1 }, '+=0.4')
    .to('#pillConfirm', { autoAlpha: 1, y: 0, duration: 0.5, ease: 'back.out(1.8)' })
    .to('#pillConfirm', { autoAlpha: 0, y: -10, duration: 0.4, onComplete: () => pick.classList.remove('picked') }, '+=2.2');

  // Gentle floating
  gs.to('.mock-card', { y: -10, duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gs.to('#pillGuard', { y: 8, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2 });
  gs.to('.blob-1', { x: -60, y: 40, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gs.to('.blob-2', { x: 80, y: -30, duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gs.to('.mock-ring', { rotate: 3, duration: 6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

initPage({
  page: 'home',
  render(ctx, { isRefresh }) {
    const { data } = ctx;
    renderContinue(data);
    if (!isRefresh) {
      animateHero();
      setupStats(data);
    }
  },
});
