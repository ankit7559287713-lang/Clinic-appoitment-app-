# Testing Strategy

## Planned test cases
| Test | Expected result |
|---|---|
| Book an available slot | Appointment is created |
| Book an already-booked slot | Request is rejected |
| Submit same booking twice | Duplicate is rejected |
| Patient selects overlapping active slot | Request is rejected |
| Cancel an upcoming appointment | Status changes to Cancelled |
| Rebook a cancelled slot | New booking is allowed |
| Submit empty required fields | Validation message appears |
| Refresh after saving sample data | LocalStorage data remains in that browser |

## Test approach
- Unit test pure booking-rule functions.
- Manually test forms, role workflows and error messages.
- Check responsive layouts at mobile, tablet and desktop widths.
- Record actual test results and date after running tests.

**Current status:** Test plan documented; execution results are pending.
