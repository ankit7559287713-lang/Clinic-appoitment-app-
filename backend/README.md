# Backend – Future scope (not implemented)

The approved initial PRD specifies a browser-based prototype using HTML, CSS, JavaScript ES6, Bootstrap 5 and LocalStorage. This directory intentionally contains no server, API, database or production authentication implementation.

The receptionist workflow is implemented in the frontend prototype and uses the same LocalStorage appointment store as patient and doctor screens. It supports assisted booking/cancellation and appointment visibility in the same browser profile. It is not shared across devices.

## Production backend responsibilities (future scope)
- Secure patient and staff authentication with server-side role authorization.
- Central persistence for patients, doctors, slots, appointments and audit events.
- Transactional booking with a unique active booking constraint per slot.
- Cancellation history and actor attribution.
- Server-side validation, backups, monitoring, HTTPS and privacy/security review.

A real backend/database requires a formally approved PRD scope change. Do not treat demo role selection or LocalStorage as production security.
