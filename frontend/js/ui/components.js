import { toISODate, addDays, parseISODate } from '../logic/dateUtils.js';

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
