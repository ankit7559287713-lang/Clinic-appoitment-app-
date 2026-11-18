// Doctor directory: search, specialty filter, next-available shortcut.
import { initPage, $, escapeHtml, avatar, emptyState } from '../ui/common.js';
import { nextAvailableSlot, countAvailable } from '../logic/slotService.js';
import { toISODate, formatDate, formatTime } from '../logic/dateUtils.js';
import { staggerIn } from '../ui/motion.js';
import { ratingInline } from '../ui/components.js';
import { doctorRating } from '../logic/reviewService.js';

const state = { q: '', specialty: 'All', availableToday: false, hideLeave: false, sort: 'name' };
let ctxRef;

const byName = (a, b) => a.name.replace(/^Dr\.\s*/, '').localeCompare(b.name.replace(/^Dr\.\s*/, ''));
const SORTS = {
  name: byName,
  // Highest average first; more reviews breaks ties; unrated doctors last.
  rating: (a, b) => (b.rating.average ?? -1) - (a.rating.average ?? -1) || b.rating.count - a.rating.count || byName(a, b),
  soonest: (a, b) => (a.next ? `${a.next.date}${a.next.startTime}` : '~').localeCompare(b.next ? `${b.next.date}${b.next.startTime}` : '~') || byName(a, b),
};


function renderPills(data) {
  const specs = ['All', ...new Set(data.doctors.map((d) => d.specialty))];
  $('#specialtyPills').innerHTML = specs.map((s) => `<button type="button" class="pill" data-spec="${escapeHtml(s)}" aria-pressed="${s === state.specialty}">${escapeHtml(s)}</button>`).join('');
}

function bindFilters() {
  $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderGrid(true); });
  $('#specialtyPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-spec]');
    if (!b) return;
    state.specialty = b.dataset.spec;
    document.querySelectorAll('#specialtyPills .pill').forEach((p) => p.setAttribute('aria-pressed', String(p === b)));
    renderGrid(true);
  });
  $('#availableToday').addEventListener('change', (e) => { state.availableToday = e.target.checked; renderGrid(true); });
  $('#hideLeave').addEventListener('change', (e) => { state.hideLeave = e.target.checked; renderGrid(true); });
  $('#sortBy').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(true); });
}

function renderGrid(animate) {
  const data = ctxRef.data;
  const now = new Date();
  const today = toISODate(now);
  const docs = data.doctors
    .map((d) => ({ ...d, next: nextAvailableSlot(data, d.doctorId, now), today: countAvailable(data, { doctorId: d.doctorId, date: today }, now), rating: doctorRating(data, d.doctorId) }))
    .filter((d) => state.specialty === 'All' || d.specialty === state.specialty)
    .filter((d) => !state.q || `${d.name} ${d.specialty}`.toLowerCase().includes(state.q))
    .filter((d) => !state.availableToday || d.today > 0)
    .filter((d) => !state.hideLeave || d.status === 'active')
    .sort(SORTS[state.sort] || SORTS.name);

  $('#resultCount').textContent = `${docs.length} doctor${docs.length === 1 ? '' : 's'} found`;
  const grid = $('#doctorGrid');
  if (!docs.length) {
    grid.innerHTML = `<div class="col-12"><div class="card">${emptyState({
      icon: 'bi-search', title: 'No doctors match your filters',
      text: 'Try a different name or specialty, or clear the filters.',
      action: '<button class="btn btn-primary" id="resetFilters"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Clear filters</button>',
    })}</div></div>`;
    $('#resetFilters').addEventListener('click', () => {
      Object.assign(state, { q: '', specialty: 'All', availableToday: false, hideLeave: false, sort: 'name' }); $('#sortBy').value = 'name';
      $('#search').value = ''; $('#availableToday').checked = false; $('#hideLeave').checked = false;
      renderPills(data); renderGrid(true);
    });
    return;
  }

  grid.innerHTML = docs.map((d) => {
    const onLeave = d.status !== 'active';
    const nextTxt = d.next
      ? `<i class="bi bi-lightning-charge-fill text-turq" aria-hidden="true"></i> Next: <strong>${d.next.date === today ? 'Today' : formatDate(d.next.date)}, ${formatTime(d.next.startTime)}</strong>`
      : '<i class="bi bi-calendar-x" aria-hidden="true"></i> No open slots';
    return `<div class="col">
      <article class="card card-hover h-100 p-4 doctor-card" aria-labelledby="doc-${d.doctorId}">
        <div class="d-flex align-items-start gap-3 mb-3">
          ${avatar(d)}
          <div class="min-w-0 flex-grow-1">
            <h3 class="h6 mb-1" id="doc-${d.doctorId}">${escapeHtml(d.name)}</h3>
            <div class="small fw-semibold text-turq">${escapeHtml(d.specialty)}</div>
            <div class="mt-1">${ratingInline(d.rating)}</div>
          </div>
        </div>
        <p class="small text-muted text-truncate-2 mb-3">${escapeHtml(d.bio)}</p>
        <div class="d-flex flex-wrap gap-2 mb-3 small">
          ${onLeave
            ? '<span class="status-badge status-onleave"><i class="bi bi-airplane" aria-hidden="true"></i>On leave</span>'
            : `<span class="status-badge status-Available"><i class="bi bi-check-circle" aria-hidden="true"></i>${d.today} open today</span>`}
          <span class="status-badge status-Past"><i class="bi bi-award" aria-hidden="true"></i>${d.experience} yrs</span>
          <span class="status-badge status-Past"><i class="bi bi-door-open" aria-hidden="true"></i>${escapeHtml(d.room)}</span>
        </div>
        <p class="small mb-3">${onLeave ? '<i class="bi bi-info-circle" aria-hidden="true"></i> Not accepting bookings right now' : nextTxt}</p>
        <div class="mt-auto d-flex gap-2">
          ${onLeave
            ? '<button class="btn btn-light border w-100" disabled aria-disabled="true"><i class="bi bi-slash-circle" aria-hidden="true"></i>Unavailable</button>'
            : `<a class="btn btn-primary flex-grow-1" href="book.html?doctor=${d.doctorId}"><i class="bi bi-calendar2-week" aria-hidden="true"></i>View slots</a>
               ${d.next ? `<a class="btn btn-soft" href="book.html?doctor=${d.doctorId}&date=${d.next.date}" aria-label="Jump to next available slot for ${escapeHtml(d.name)}" title="Next available"><i class="bi bi-skip-forward-fill" aria-hidden="true"></i></a>` : ''}`}
        </div>
      </article>
    </div>`;
  }).join('');
  if (animate) staggerIn('#doctorGrid .doctor-card', { stagger: 0.07 });
}

initPage({
  page: 'doctors',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    if (!isRefresh) { renderPills(ctx.data); bindFilters(); }
    renderGrid(!isRefresh);
  },
});
