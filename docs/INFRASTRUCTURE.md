# Infrastructure Requirements

## Development environment
| Component | Requirement |
|---|---|
| Hardware | Laptop or desktop capable of running a modern browser and code editor |
| Operating system | Windows, macOS or Linux |
| Editor | Visual Studio Code or equivalent |
| Browser | Current Chrome, Firefox, Edge or Safari |
| Frontend | HTML5, CSS3, JavaScript ES6, Bootstrap 5 |
| Initial storage | Browser LocalStorage |
| Version control | Git and GitHub |
| Local preview | VS Code Live Server or another static HTTP server |

## Initial runtime architecture
The prototype runs in the user's browser. HTML provides structure, CSS and Bootstrap provide presentation, JavaScript handles interface logic, and LocalStorage stores sample data on that browser/device.

## Network requirements
Internet access is needed if Bootstrap is loaded from its CDN. Alternatively, Bootstrap assets can be stored locally.

## Backend and database status
A backend server and central database are not part of the implemented initial foundation. The backend directory is reserved for future work. Do not describe it as deployed or operational.

## Limitations
- LocalStorage does not synchronize data between users or devices.
- Clearing browser data can remove prototype records.
- Client-side role selection is not secure authentication.
- Simultaneous bookings from different devices require server-side validation and database transactions in production.

## Production infrastructure – future scope
A production release would require a hosted application, secure API, central database, authentication/authorization, backups, monitoring, HTTPS and privacy/security review.
