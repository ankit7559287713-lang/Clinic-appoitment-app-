# Clinic Appointment App

A two-member OJT project focused on organizing clinic appointment scheduling for patients, doctors and receptionists.

## Project status
**Working frontend prototype (ClinicBook).** The browser app in `frontend/` implements patient, doctor and receptionist workflows using fictional sample data in LocalStorage. There is no backend or cloud synchronization.

## Technology stack
- Frontend: HTML5, CSS3, JavaScript ES6 modules, Bootstrap 5, GSAP (animations)
- Initial prototype storage: Browser LocalStorage
- Tests: Node.js built-in test runner (`node:test`)
- Version control: Git and GitHub
- Backend: documented as future scope; no backend framework or API is currently implemented

## User roles
- **Patient:** sign in with a registered 10-digit mobile number or email; browse doctors, book and cancel appointments, request emergency care, and view completed clinical records
- **Doctor:** sign in with a staff ID; manage availability, review today's and upcoming appointments, handle assigned/approved cases, and maintain consultation records
- **Receptionist:** demo login (`REC-001`); manage walk-ins and check-ins, monitor the live queue and scheduled appointments, manage doctor accounts, and verify emergency requests

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

Demo logins (fictional data): patient phone `9876501001` or email `aarav.sharma@example.in`, doctor staff ID `DOC-101`, receptionist staff ID `REC-001`, or click any demo account on the login pages.

Run the booking-rule tests: `cd frontend && npm test`

Receptionist dashboard: `frontend/receptionist.html` (sign in with `REC-001`).

See [frontend/README.md](frontend/README.md) for screens, architecture and rules.

## Core business rules
1. Regular bookings reserve a 30-minute block: 15 minutes for consultation and 15 minutes protected for emergency care.
2. Availability is derived from appointment and emergency-request records; overlapping active bookings are rejected.
3. Cancellation and completion history is retained. Only the assigned doctor can edit an appointment or assigned walk-in/emergency encounter's clinical record.
4. Emergency requests remain separate from appointments. Receptionists verify and approve or reject them; only approved cases are forwarded to a doctor and assigned an emergency buffer.
5. Walk-ins and QR check-ins enter a separate receptionist queue. QR registration is a one-time demographics handoff; it does not synchronize LocalStorage across devices.

## Documentation
- [Project Report](docs/PROJECT_REPORT.md)
- [Infrastructure Requirements](docs/INFRASTRUCTURE.md)
- [Functional Requirements](docs/REQUIREMENTS.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Application Workflow](docs/WORKFLOW.md)
- [Testing Strategy](docs/TESTING_STRATEGY.md)
- [Development Roadmap](docs/DEVELOPMENT_ROADMAP.md)

## Important limitations
LocalStorage is browser/device-specific and does not synchronize users across devices. QR appointment check-in is verified only against data stored in the clinic browser; patient registration handoff requires an explicit scan/import or file transfer. Client-side role selection is not secure authentication. This educational prototype must not be used for real medical records; production use requires secure authentication, server-side validation and an appropriate protected data service.
