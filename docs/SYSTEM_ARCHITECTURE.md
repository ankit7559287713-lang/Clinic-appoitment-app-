# System Architecture

## Initial prototype
```text
User -> Browser UI (HTML + Bootstrap) -> JavaScript UI / Event Handlers
     -> Booking Rules and Validation -> LocalStorage (this browser only)
```

## Responsibilities
- Presentation: HTML, CSS and Bootstrap components.
- Application logic: JavaScript modules for doctors, appointments and storage.
- Persistence: LocalStorage for the initial single-browser prototype.

## Future architecture (not implemented)
```text
Web Client -> Secure API -> Booking Service -> Central Database
                     |
                     -> Authentication / Authorization
```

The future architecture is conceptual only. No API, server or central database is currently included in this repository.
