# Clinic Appointment App – OJT Project Report

## Abstract
Clinic Appointment App is a proposed browser-based system to organize appointment scheduling for small clinics. It focuses on Patient, Doctor and Receptionist roles. The initial prototype is planned with HTML, CSS, JavaScript ES6, Bootstrap 5 and browser LocalStorage.

## Problem statement
Manual registers, phone calls and spreadsheets can make it difficult to track doctor availability and may lead to duplicate or unclear appointments. The project aims to provide a clear appointment-slot workflow.

## Objectives
- Display doctor profiles and specialties.
- Show available appointment slots.
- Support booking, viewing and cancellation.
- Prevent duplicate active bookings for the same doctor slot.
- Prevent overlapping active appointments for a patient.
- Provide doctor schedule and receptionist-assisted booking workflows.

## Scope
**Initial scope:** front-end prototype, sample data, LocalStorage persistence and core booking-rule validation.
**Out of scope:** production authentication, central database, online payments, notifications and medical-record management.

## User roles
- Patient: browse doctors, select slots, book and cancel.
- Doctor: manage availability and view appointments.
- Receptionist: assist with booking and cancellation.

## Technology stack
HTML5, CSS3, JavaScript ES6, Bootstrap 5, browser LocalStorage, Git and GitHub.

## Proposed workflow
1. User selects a demonstration role.
2. Patient browses doctors and selects a date.
3. Available slots are displayed.
4. User submits booking details.
5. Booking logic checks duplicate slot and patient overlap.
6. Valid booking is saved; invalid requests show an error.
7. Cancellation marks an appointment Cancelled and releases the slot.

## Current status
This repository contains the initial project foundation and documentation. Complete booking workflows, backend, automated test execution and deployment remain pending. Update this section as work is actually completed.

## Future scope
A secure backend, central database, authentication, notifications, rescheduling, reporting and production deployment may be considered later.
