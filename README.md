# Clinic Appointment App

A two-member OJT project focused on organizing clinic appointment scheduling for patients, doctors and receptionists.

## Project status
**Working frontend prototype (ClinicBook).** The browser app in `frontend/` implements the patient and doctor workflows on sample data in LocalStorage, with automated tests for the booking rules. The backend remains future scope; receptionist workflows run in the browser prototype.

## Technology stack
- Frontend: HTML5, CSS3, JavaScript ES6 modules, Bootstrap 5, GSAP (animations)
- Initial prototype storage: Browser LocalStorage
- Tests: Node.js built-in test runner (`node:test`)
- Version control: Git and GitHub
- Backend: documented as future scope; no backend framework or API is currently implemented

## User roles
- **Patient:** sign in with a registered phone number; browse doctors, view slots, book and cancel appointments, and review completed visits
- **Doctor:** sign in with a staff ID; manage availability, view the day's schedule, mark visits completed and read patient reviews
- **Receptionist:** demo login (`REC-001`); can book/cancel for registered patients and view all appointment statuses

## Repository structure
```text
frontend/   ClinicBook web app (HTML, CSS, JavaScript, Bootstrap 5) and its tests
backend/    Backend planning and future module placeholder
docs/       Project report, requirements, infrastructure and architecture
diagrams/   Workflow diagram
```

## Preview the frontend
The app uses JavaScript modules, so it must be served (opening the file directly shows a blank page):

- **VS Code:** right-click `frontend/index.html` → **Open with Live Server**, or
- **Node:** `cd frontend && npm start`, then open http://localhost:5730

Demo logins (fictional data): patient phone `555-010-2001`, doctor staff ID `DOC-101`, receptionist staff ID `REC-001`, or click any demo account on the login pages.

Run the booking-rule tests: `cd frontend && npm test`

Receptionist dashboard: `frontend/receptionist.html` (sign in with `REC-001`).

See [frontend/README.md](frontend/README.md) for screens, architecture and rules.

## Core business rules (implemented and tested)
1. A doctor slot must not have more than one active booking.
2. A patient must not have overlapping active appointments.
3. Cancelling an appointment should release its slot.
4. Required form fields must be validated.
5. Patients can review a visit only after it is completed, once per visit.

## Documentation
- [Project Report](docs/PROJECT_REPORT.md)
- [Infrastructure Requirements](docs/INFRASTRUCTURE.md)
- [Functional Requirements](docs/REQUIREMENTS.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Application Workflow](docs/WORKFLOW.md)
- [Testing Strategy](docs/TESTING_STRATEGY.md)
- [Development Roadmap](docs/DEVELOPMENT_ROADMAP.md)

## Important limitations
LocalStorage is browser/device-specific and does not synchronize users across devices. Client-side role selection is not secure authentication. A production system would require a secure backend, central database, server-side validation and authentication/authorization.
