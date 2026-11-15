# ClinicBook – Clinic Appointment Booking

Doctors publish time slots, patients book them, and the system guarantees a slot can never be booked twice.
Built with **HTML5, CSS3, Bootstrap 5.3, vanilla JavaScript (ES modules) and GSAP 3** for animation, with a whitesmoke theme and turquoise accents.

## Run it

ES modules don't load from `file://`, so serve the folder:

```bash
npm start            # node serve.mjs → http://localhost:5730
```

(Any static server works, e.g. VS Code Live Server.)

Run the booking-rule tests (Node 18+, no dependencies):

```bash
npm test
```

## Roles (demonstration login)

Patients and doctors have separate login pages. There are no passwords (real authentication is out of scope): a patient signs in with their registered phone number (e.g. `555-010-2001`) and a doctor with their staff ID (e.g. `DOC-101`), or by clicking one of the demo accounts listed on the page. The login is stored per browser tab (sessionStorage), so you can open two tabs as different patients to see conflict protection live.

| Role | Can do |
|---|---|
| **Patient** | Browse doctors, see Available/Booked slots, book with a reason, view & cancel own appointments |
| **Patient (reviews)** | Rate a completed visit 1–5 stars with an optional comment; edit or delete own reviews |
| **Doctor** | Add/remove own unbooked slots (no overlaps), view day schedule, mark appointments completed |

## Screens

| File | Screen |
|---|---|
| `index.html` | Landing page with links to both logins |
| `patient-login.html` | Patient login (phone number) |
| `doctor-login.html` | Doctor login (staff ID) |
| `doctors.html` | Doctor directory (search, specialty filter, next available) |
| `book.html` | Slot picker + booking modal / confirmation |
| `appointments.html` | My Appointments (patient) |
| `schedule.html` | Doctor schedule + slot management |
| `settings.html` | Current role, reset sample data, known limitations |

## Architecture

```
js/logic/   DOM-free, unit-tested
  dateUtils.js       date/time helpers (local clinic time)
  sampleData.js      fictional data generated relative to today
  storage.js         versioned LocalStorage + transact() (load → check → save)
  validators.js      form validation
  roleGuard.js       which role may open which page / do which action
  authService.js     demo login lookup (phone number / staff ID)
  reviewService.js   patient reviews: add / edit / delete, derived doctor rating
  slotService.js     list/add/remove slots, overlap detection, derived status
  bookingService.js  book / cancel / complete
js/ui/      navbar, toasts, confirm modal, session, GSAP motion helpers
js/pages/   one script per page
css/styles.css       turquoise theme over Bootstrap
tests/booking.test.js node:test suite
```

### Booking rules
1. A slot's availability is **derived** from appointments – there is no stored `isBooked` flag.
2. `bookAppointment()` re-reads storage and checks + writes in one synchronous call.
3. A slot has at most one active (`Booked`) appointment → otherwise `SLOT_TAKEN`.
4. A patient can't hold two overlapping active appointments, even with different doctors → `PATIENT_OVERLAP`.
5. Past slots can't be booked → `SLOT_IN_PAST`.
6. Doctor slots can't overlap → `SLOT_OVERLAP`; booked slots can't be removed → `SLOT_HAS_BOOKING`.
7. Cancelling keeps the record, frees the slot; cancelling twice → `ALREADY_CANCELLED`.
8. Only `Booked` → `Completed`; `Completed` and `Cancelled` are final.

Pages listen for the browser `storage` event and re-render, so other tabs see changes immediately.

### Review rules
1. Only the patient who attended can review, and only once the visit is `Completed`.
2. One review per visit; rating is a whole number 1–5, comment is optional (max 300 characters).
3. Patients can edit or delete only their own reviews.
4. A doctor's average rating is calculated from reviews, never stored.
5. Reviews show the patient as first name + last initial, with a “Verified visit” badge.

### Tests cover
Two patients booking the same slot · the same booking submitted twice · cancel then rebook · overlapping doctor slots · a patient overlapping across two doctors · booking a past slot · cancelling an already-cancelled appointment · completion rules · slot removal rules · role checks · validators · review rules (ownership, completed-only, one per visit, rating range, edit/delete, average) · sample data integrity.

## Known limitations
- Data lives in this browser's LocalStorage; it isn't shared across devices or browsers.
- LocalStorage isn't transactional. True multi-user booking needs a server enforcing a unique constraint per slot.
- Roles are a demonstration login, not security.
- All data is fictional. Don't enter real health information.
- Animations respect `prefers-reduced-motion`.
