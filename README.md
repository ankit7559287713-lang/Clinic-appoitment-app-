# Clinic Appointment App

A two-member OJT project focused on organizing clinic appointment scheduling for patients, doctors and receptionists.

## Project status
**Initial documentation and project foundation.** Requirements and proposed architecture are documented. Complete appointment workflows, backend services, automated test execution and deployment are pending implementation unless explicitly marked otherwise in later commits.

## Proposed technology stack
- Frontend: HTML5, CSS3, JavaScript ES6, Bootstrap 5
- Initial prototype storage: Browser LocalStorage
- Version control: Git and GitHub
- Backend: documented as future scope; no backend framework or API is currently implemented

## User roles
- **Patient:** browse doctors, view slots, book and cancel appointments
- **Doctor:** manage availability and view appointment schedule
- **Receptionist:** assist with appointment booking and cancellation

## Repository structure
```text
frontend/   HTML, CSS and JavaScript starter files
backend/    Backend planning and future module placeholder
docs/       Project report, requirements, infrastructure and architecture
diagrams/   Workflow diagram
```

## Preview the frontend
Open `frontend/index.html` in a browser, or use VS Code Live Server.

## Core business rules to implement
1. A doctor slot must not have more than one active booking.
2. A patient must not have overlapping active appointments.
3. Cancelling an appointment should release its slot.
4. Required form fields must be validated.

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
