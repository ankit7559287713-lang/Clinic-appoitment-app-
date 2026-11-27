// GSAP animation helpers. Every helper is a no-op when GSAP is missing or the
// user prefers reduced motion, so content is always visible without animation.
const g = () => window.gsap;

export const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const canAnimate = () => Boolean(g()) && !prefersReduced();

if (window.gsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);

const toArray = (t) => (typeof t === 'string' ? [...document.querySelectorAll(t)] : t instanceof Element ? [t] : [...(t || [])]);

export function hideLoader() {
  const el = document.getElementById('pageLoader');
  if (!el) return;
  if (!canAnimate()) { el.remove(); return; }
  g().to(el, { autoAlpha: 0, duration: 0.45, ease: 'power2.out', delay: 0.15, onComplete: () => el.remove() });
  setTimeout(() => el.remove(), 1500); // fallback if animation frames are throttled (background tab)
}

export function staggerIn(targets, opts = {}) {
  const els = toArray(targets);
  if (!els.length || !canAnimate()) return null;
  return g().fromTo(els,
    { y: opts.y ?? 22, autoAlpha: 0, scale: opts.scale ?? 1 },
    { y: 0, autoAlpha: 1, scale: 1, duration: opts.duration ?? 0.55, ease: opts.ease ?? 'power3.out', stagger: opts.stagger ?? 0.06, delay: opts.delay ?? 0, clearProps: 'transform,opacity,visibility' });
}

export function popIn(targets, opts = {}) {
  return staggerIn(targets, { y: 8, scale: 0.92, ease: 'back.out(1.6)', duration: 0.45, stagger: 0.025, ...opts });
}

/** Navbar + elements marked data-animate on first paint; data-reveal on scroll. */
export function pageIn() {
  if (!canAnimate()) return;
  const gs = g();
  gs.from('.cb-navbar', { y: -24, autoAlpha: 0, duration: 0.6, ease: 'power3.out', clearProps: 'all' });
  const intro = toArray('[data-animate]');
  if (intro.length) staggerIn(intro, { delay: 0.15, stagger: 0.08 });
  if (window.ScrollTrigger && document.querySelector('[data-reveal]')) {
    gs.set('[data-reveal]', { autoAlpha: 0, y: 36 });
    window.ScrollTrigger.batch('[data-reveal]', {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => gs.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, clearProps: 'transform,opacity,visibility' }),
    });
  }
}

export function countUp(el, to, { duration = 1.4, delay = 0 } = {}) {
  if (!el) return;
  if (!canAnimate()) { el.textContent = String(to); return; }
  const obj = { v: 0 };
  g().to(obj, { v: to, duration, delay, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(obj.v); } });
}

export function shake(el) {
  if (!el || !canAnimate()) return;
  g().fromTo(el, { x: 0 }, { keyframes: { x: [-10, 10, -7, 7, -3, 0] }, duration: 0.45, ease: 'power1.inOut', clearProps: 'transform' });
}

export function pulse(el) {
  if (!el || !canAnimate()) return;
  g().fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', clearProps: 'transform' });
}

export function slideToast(el) {
  if (!el || !canAnimate()) return;
  g().from(el, { x: 60, autoAlpha: 0, duration: 0.45, ease: 'back.out(1.4)', clearProps: 'transform,opacity,visibility' });
}

/** Animate out then run cb (used before removing/re-rendering an item). */
export function leave(el, cb) {
  if (!el || !canAnimate()) { cb?.(); return; }
  g().to(el, { autoAlpha: 0, x: 40, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.4, ease: 'power2.in', onComplete: () => cb?.() });
}

/** Draw the success check mark and a turquoise particle burst. */
export function celebrate(container) {
  if (!container) return;
  const circle = container.querySelector('circle');
  const path = container.querySelector('path');
  if (!canAnimate()) return;
  const gs = g();
  const len = path.getTotalLength();
  const tl = gs.timeline();
  tl.fromTo(container.querySelector('svg'), { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2)' })
    .fromTo(circle, { scale: 0.6, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.4, ease: 'power2.out' }, '<')
    .fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }, '-=0.15');

  const colors = ['#40e0d0', '#1cc2b2', '#0b8076', '#a0efe6', '#67e0d3'];
  for (let i = 0; i < 18; i++) {
    const dot = document.createElement('span');
    dot.className = 'burst-dot';
    dot.style.background = colors[i % colors.length];
    container.appendChild(dot);
    const angle = (Math.PI * 2 * i) / 18;
    const dist = 70 + Math.random() * 40;
    gs.fromTo(dot, { x: -4, y: -4, scale: 1, autoAlpha: 1 },
      { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: 0.2, autoAlpha: 0, duration: 0.9 + Math.random() * 0.3, delay: 0.25, ease: 'power3.out', onComplete: () => dot.remove() });
  }
  return tl;
}
