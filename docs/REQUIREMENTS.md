# Project Requirements

## Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Patient can browse doctors and specialties | High |
| FR-02 | Patient can view available slots | High |
| FR-03 | Patient can book a free slot | High |
| FR-04 | Duplicate active booking for a doctor slot is rejected | Critical |
| FR-05 | Overlapping active appointments for a patient are rejected | High |
| FR-06 | Patient can cancel an upcoming appointment | High |
| FR-07 | Cancelled slot becomes available again | High |
| FR-08 | Doctor can view schedule and manage unbooked slots | Medium |
| FR-09 | Receptionist can book/cancel for a patient | Medium |
| FR-10 | Forms validate required fields | High |

## Non-functional requirements
- Usable, readable and responsive interface.
- Keyboard-accessible controls and visible focus states.
- Booking logic should be reusable and testable.
- Use fictional sample data only.
- Maintain separation between UI and business rules.

## Assumptions and constraints
- Initial prototype is browser-based.
- LocalStorage is local to one browser/device.
- Demonstration role selection is not production security.
- Multi-device booking consistency requires a backend and central database.
