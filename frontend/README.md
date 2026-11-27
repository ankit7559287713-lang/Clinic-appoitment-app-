# ClinicBook – Clinic Appointment Booking

ClinicBook is an educational clinic scheduling prototype built with HTML, CSS, Bootstrap 5, vanilla JavaScript ES modules and LocalStorage. It has no server or database.

## Run and test

Serve this directory (ES modules do not load from `file://`):

```bash
npm start
```

Open `http://localhost:5730`. To run the automated suite:

```bash
npm test
```

Tests use Node's built-in test runner; no package installation is required.

## Demo access

There are no passwords; the login pages offer fictional demo accounts.

| Role | Demo login |
|---|---|
| Patient | `9876501001` or `aarav.sharma@example.in` |
| Doctor | `DOC-101` |
| Receptionist | `REC-001` |

Patient mobile login requires exactly 10 digits. The session is stored in `sessionStorage` per browser tab.

## Screens

| File | Screen |
|---|---|
| `patient-login.html` | Patient mobile or email login |
| `patient-register.html` | Patient self-registration and optional walk-in handoff QR |
| `doctors.html` | Searchable doctor directory and specialty autocomplete |
| `book.html` | Doctor profile, slots, booking and emergency request |
| `appointments.html` | Patient appointments, emergency status and own completed clinical records |
| `patient-record.html` | Dedicated chart for receptionists and doctors assigned to the workflow |
| `schedule.html` | Doctor schedule, assigned walk-ins, approved emergency cases and appointments |
| `receptionist.html` | Patient search, registration handoff import, walk-in queue, QR check-in, and doctor/emergency management |
| `settings.html` | Current role, sample data reset and limitations |

## Architecture

```
js/logic/   DOM-free application services and data
  authService.js          demo login lookup
  bookingService.js       booking, cancellation and consultation status
  consultationService.js  encounter-linked consultations, amendments and scoped reads
  doctorService.js        receptionist-managed doctor accounts
  doctorDirectory.js      profile links and specialty matching
  emergencyService.js     receptionist approval and emergency buffer workflow
  patientService.js       patient registration and duplicate detection
  qrHandoffService.js     one-time demographics handoff between browsers
  receptionService.js     walk-ins, queue, patient lookup and appointment QR validation
  qrCode.js               locally bundled QR generation
  sampleData.js           fictional Indian patient data and 30-minute slots
  slotService.js          slot status derived from saved appointments and requests
  storage.js              versioned LocalStorage migration and synchronous transactions
  validators.js           input validation
  roleGuard.js            demonstration role and ownership checks
js/ui/      shared navigation, forms, toasts and animation helpers
js/pages/   page-specific controllers
css/styles.css
tests/booking.test.js     Node test suite
```

## Scheduling and records

- Each slot reserves 30 minutes: a 15-minute consultation and 15-minute emergency buffer. Receptionists assign an available buffer when approving a request; doctors manage the approved case from their schedule.
- Slot availability is derived from appointment and emergency-request records. Past slots, doctor availability, duplicate bookings and patient/doctor overlaps are checked before saving.
- Patients can register themselves and later sign in by registered mobile or email. Phone/email duplicates are checked against this browser's saved patient list.
- Emergency requests remain separate from normal appointments. Receptionists verify, assign a doctor and buffer, then approve or reject; doctors only see approved cases.
- Consultation notes, prescriptions and amendments are linked to an appointment or walk-in/emergency encounter, patient and doctor. Patients see only their own completed records.
- Receptionist walk-ins and scheduled QR check-ins use separate queue records. Existing patients are selected; newly self-registered walk-ins can transfer demographics through a one-time QR/file handoff.

## Limitations

- LocalStorage is browser- and device-specific, has no cross-device synchronization, and does not provide atomic multi-user transactions. Concurrent tabs/devices can still race; the application is not suitable for real clinic operations.
- The clinic registration QR opens the registration page, but the patient's and clinic's LocalStorage remain separate. The patient must show the generated one-time handoff QR or transfer the JSON handoff file for receptionist import; this is not live synchronization. Appointment QR check-in is checked against clinic-browser data only.
- Camera scanning requires camera permission, a secure context such as localhost or HTTPS, and browser support for `BarcodeDetector`; support varies by device and browser. Manual payload entry/file import remains available.
- Login and role checks are demonstration-only client-side controls. All data is fictional; do not enter real patient information.
- Existing records are preserved during the versioned schema migration. Legacy slots that do not use 30-minute blocks remain in history but are unavailable for new bookings.
- Animations respect `prefers-reduced-motion`.
