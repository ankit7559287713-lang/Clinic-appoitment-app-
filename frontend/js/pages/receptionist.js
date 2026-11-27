import { initPage, $, $$, escapeHtml, statusBadge, toast, confirmDialog, emptyState } from '../ui/common.js';
import { bookAppointment, cancelAppointment } from '../logic/bookingService.js';
import { isSlotBooked } from '../logic/slotService.js';
import { isPastSlot, formatDate, formatTime, toISODate } from '../logic/dateUtils.js';
import { emergencyBuffers, listEmergencyRequests, approveEmergencyRequest, rejectEmergencyRequest } from '../logic/emergencyService.js';
import {
  addWalkInToQueue,
  assignEmergencyWalkIn,
  checkInAppointmentByQr,
  doctorQueueEntries,
  searchPatients,
  updateQueueStatus,
} from '../logic/receptionService.js';
import { addDoctor, setDoctorActive, updateDoctor } from '../logic/doctorService.js';
import { importPatientHandoff, parsePatientHandoff, HANDOFF_PREFIX } from '../logic/qrHandoffService.js';

let ctxRef;
let scannerStream = null;
let scannerFrame = null;
let scannerActive = false;
let scannerBusy = false;
const state = { filter: 'All', search: '', patientSearch: '', selectedPatientId: null, pendingHandoff: null, editingDoctorId: null };

const todayISO = () => toISODate(new Date());
const patientOf = (appointment) => ctxRef.data.patients.find((patient) => patient.patientId === appointment.patientId) || { name: 'Unknown patient', phone: '' };
const doctorOf = (appointment) => ctxRef.data.doctors.find((doctor) => doctor.doctorId === appointment.doctorId) || { name: 'Unknown doctor', specialty: '' };
const queueToday = () => (ctxRef.data.queueEntries || []).filter((entry) => toISODate(new Date(entry.createdAt)) === todayISO());

function renderSelectors() {
  const patientOptions = ctxRef.data.patients.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((patient) => `<option value="${escapeHtml(patient.patientId)}">${escapeHtml(patient.name)} · ${escapeHtml(patient.phone)}</option>`).join('');
  if ($('#patientId').options.length !== ctxRef.data.patients.length + 1) {
    $('#patientId').innerHTML = `<option value="">Select patient</option>${patientOptions}`;
  }
  const doctorOptions = ctxRef.data.doctors.filter((doctor) => doctor.status === 'active')
    .map((doctor) => `<option value="${escapeHtml(doctor.doctorId)}">${escapeHtml(doctor.name)} · ${escapeHtml(doctor.specialty)}</option>`).join('');
  ['doctorId', 'walkinDoctor', 'referralDoctor'].forEach((id) => {
    const select = $(`#${id}`);
    const first = id === 'referralDoctor' ? '<option value="">No referral</option>' : id === 'walkinDoctor' ? '<option value="">Not assigned</option>' : '<option value="">Select doctor</option>';
    if (select.options.length !== ctxRef.data.doctors.filter((doctor) => doctor.status === 'active').length + 1) {
      select.innerHTML = `${first}${doctorOptions}`;
    }
  });
}

function refreshSlots() {
  const doctorId = $('#doctorId').value;
  const date = $('#appointmentDate').value;
  const slots = ctxRef.data.slots.filter((slot) => slot.doctorId === doctorId && slot.date === date &&
    !slot.legacyBlock && !isSlotBooked(ctxRef.data, slot.slotId) && !isPastSlot(slot));
  $('#slotId').innerHTML = '<option value="">Choose an available 30-minute block</option>' +
    slots.map((slot) => `<option value="${escapeHtml(slot.slotId)}">${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}</option>`).join('');
}

function renderStats() {
  const queue = queueToday();
  const stats = [
    ['Scheduled today', ctxRef.data.appointments.filter((appointment) => appointment.date === todayISO() && appointment.status === 'Booked').length],
    ['Waiting', queue.filter((entry) => entry.status === 'Waiting' && entry.entryType === 'WalkIn').length],
    ['Currently consulting', queue.filter((entry) => entry.status === 'Consulting' && entry.entryType === 'WalkIn').length],
    ['Completed today', queue.filter((entry) => entry.status === 'Completed' && entry.entryType === 'WalkIn').length],
    ['Emergency pending', listEmergencyRequests(ctxRef.data).filter((request) => request.status === 'pending_approval').length],
  ];
  $('#deskStats').innerHTML = stats.map(([label, count]) => `<div class="col-6 col-lg"><div class="card p-3 h-100"><div class="small text-muted">${label}</div><div class="h4 mb-0">${count}</div></div></div>`).join('');
}

function renderEmergencyAlerts() {
  const requests = listEmergencyRequests(ctxRef.data);
  const host = $('#emergencyAlerts');
  if (!requests.length) {
    host.innerHTML = '<p class="text-muted mb-0">No emergency requests.</p>';
    return;
  }
  host.innerHTML = requests.map((request) => {
    const patient = ctxRef.data.patients.find((entry) => entry.patientId === request.patientId);
    const doctor = ctxRef.data.doctors.find((entry) => entry.doctorId === request.doctorId);
    const slot = request.slotId && ctxRef.data.slots.find((entry) => entry.slotId === request.slotId);
    const pending = request.status === 'pending_approval';
    const start = slot && (slot.emergencyBufferStartTime || slot.consultationEndTime);
    const end = slot && (slot.emergencyBufferEndTime || slot.endTime);
    return `<article class="border rounded-4 p-3 mb-2">
      <div class="d-flex flex-wrap justify-content-between gap-2"><strong>${escapeHtml(patient?.name || 'Unknown patient')}</strong>${statusBadge(request.legacyDecision ? `Legacy ${request.legacyStatus}` : request.status)}</div>
      <div class="small text-muted mt-1">${patient?.phone ? `Phone: ${escapeHtml(patient.phone)}` : ''}${patient?.email ? `${patient?.phone ? ' · ' : ''}Email: ${escapeHtml(patient.email)}` : ''}</div>
      <p class="small mb-1 mt-2">${escapeHtml(request.reason)} · <span class="text-muted">${new Date(request.createdAt).toLocaleString()}</span></p>
      <p class="small ${pending ? 'fw-semibold text-danger' : 'text-muted'} mb-2">Requested doctor: ${escapeHtml(doctor?.name || 'Doctor not assigned')}${slot ? ` · ${pending ? 'Requested time' : 'Appointment'}: ${formatDate(slot.date)} · ${formatTime(start)}–${formatTime(end)}` : ''}</p>
      <a class="btn btn-sm btn-soft" href="patient-record.html?patient=${encodeURIComponent(request.patientId)}">Review patient chart</a>
      ${pending ? `<div class="d-flex gap-2 mt-2" data-emergency-card="${escapeHtml(request.requestId)}">
        <button class="btn btn-sm btn-primary" data-emergency-approve="${escapeHtml(request.requestId)}">Approve and confirm appointment</button>
        <button class="btn btn-sm btn-outline-danger" data-emergency-reject="${escapeHtml(request.requestId)}">Reject</button>
      </div>` : ''}
    </article>`;
  }).join('');
}

function renderPatientSearch() {
  const results = searchPatients(ctxRef.data, state.patientSearch).slice(0, 8);
  $('#patientSearchResults').innerHTML = results.map((patient) =>
    `<div class="d-inline-flex gap-1">
      <button type="button" class="btn btn-sm ${patient.patientId === state.selectedPatientId ? 'btn-primary' : 'btn-soft'}" data-select-patient="${escapeHtml(patient.patientId)}">${escapeHtml(patient.name)} · ${escapeHtml(patient.phone)}</button>
      <a class="btn btn-sm btn-light border" href="patient-record.html?patient=${encodeURIComponent(patient.patientId)}" aria-label="Open ${escapeHtml(patient.name)} patient chart">Chart</a>
    </div>`,
  ).join('') || (state.patientSearch ? '<span class="small text-muted">No matching patients. Register a new patient below.</span>' : '<span class="small text-muted">Search by name, mobile, or email.</span>');
  const patient = ctxRef.data.patients.find((entry) => entry.patientId === state.selectedPatientId);
  $('#selectedPatientDetails').classList.toggle('d-none', !patient);
  $('#addExistingToQueue').disabled = !patient;
  $('#assignEmergencyWalkIn').disabled = !patient;
  if (patient) {
    $('#selectedPatientDetails').innerHTML = `<strong>${escapeHtml(patient.name)}</strong><br><span class="small">${escapeHtml(patient.phone)} · ${escapeHtml(patient.email || 'No email')}</span>`;
  }
}

function queueCard(entry) {
  const patient = patientOf(entry);
  const doctor = entry.doctorId ? doctorOf({ doctorId: entry.doctorId }) : null;
  const appointment = entry.appointmentId && ctxRef.data.appointments.find((item) => item.appointmentId === entry.appointmentId);
  const details = appointment ? `${formatTime(appointment.startTime)} · ${formatDate(appointment.date)}` : `Walk-in · ${new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return `<article class="border rounded-4 p-3 mb-2">
    <div class="d-flex justify-content-between gap-2"><strong>${entry.queueNumber ? `#${entry.queueNumber} · ` : ''}${escapeHtml(patient.name)}</strong>
      <span class="d-flex gap-1 align-items-center">${entry.entryType === 'EmergencyWalkIn' ? '<span class="badge text-bg-danger">EMERGENCY</span>' : ''}${statusBadge(entry.status)}</span></div>
    <div class="small text-muted">${details}${doctor ? ` · ${escapeHtml(doctor.name)}` : ''}</div>
    ${entry.emergencySlotId ? `<div class="small text-danger mt-1">Verified emergency buffer: ${escapeHtml(entry.emergencySlotId)}</div>` : ''}
    ${entry.referralDoctorId ? `<div class="small mt-1">Referral: ${escapeHtml(doctorOf({ doctorId: entry.referralDoctorId }).name)} ${entry.referralReason ? `· ${escapeHtml(entry.referralReason)}` : ''}</div>` : ''}
    <div class="d-flex flex-wrap gap-2 mt-2">
      <a class="btn btn-sm btn-soft" href="patient-record.html?patient=${encodeURIComponent(entry.patientId)}&encounterId=${encodeURIComponent(entry.queueId)}">Patient chart</a>
      ${entry.entryType === 'WalkIn' && entry.status === 'Waiting' ? `<button class="btn btn-sm btn-outline-primary" data-queue-status="${entry.queueId}" data-next-status="Consulting">Start consulting</button>` : ''}
      ${entry.entryType === 'WalkIn' && entry.status === 'Consulting' ? `<button class="btn btn-sm btn-soft" data-queue-status="${entry.queueId}" data-next-status="Waiting">Return to waiting</button>` : ''}
      ${entry.entryType === 'WalkIn' && entry.status === 'Waiting' ? `<button class="btn btn-sm btn-outline-danger" data-queue-status="${entry.queueId}" data-next-status="Cancelled">Remove</button>` : ''}
    </div>
  </article>`;
}

function renderQueue() {
  const todayQueue = queueToday().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups = [
    { status: 'Waiting', selector: '#waitingQueue', type: 'WalkIn' },
    { status: 'Consulting', selector: '#consultingQueue', type: 'WalkIn' },
    { status: 'Completed', selector: '#completedQueue', type: 'WalkIn' },
    { status: null, selector: '#emergencyQueue', type: 'EmergencyWalkIn' },
    { status: 'Waiting', selector: '#scheduledCheckinQueue', type: 'ScheduledCheckIn' },
  ];
  groups.forEach(({ status, selector, type }) => {
    const entries = todayQueue.filter((entry) => (!status || entry.status === status) && entry.entryType === type);
    $(selector).innerHTML = entries.map(queueCard).join('') || '<p class="small text-muted">No patients.</p>';
  });
}

function renderAppointments() {
  const q = state.search.toLowerCase();
  const rows = ctxRef.data.appointments.slice()
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .filter((appointment) => state.filter === 'All' || appointment.status === state.filter)
    .filter((appointment) => !q || patientOf(appointment).name.toLowerCase().includes(q) || doctorOf(appointment).name.toLowerCase().includes(q));
  const host = $('#appointmentRegister');
  host.innerHTML = rows.length ? rows.map((appointment) => {
    const patient = patientOf(appointment);
    const doctor = doctorOf(appointment);
    const checkedIn = appointment.checkedInAt ? `<span class="badge text-bg-success">Checked in</span>` : '';
    return `<article class="border rounded-4 p-3 mb-2">
      <div class="d-flex flex-wrap justify-content-between gap-2"><div><strong>${escapeHtml(patient.name)}</strong><div class="small text-muted">${escapeHtml(doctor.name)} · ${escapeHtml(doctor.specialty)}</div></div><div class="d-flex gap-2">${statusBadge(appointment.status)}${checkedIn}</div></div>
      <div class="small mt-2">${formatDate(appointment.date)} · ${formatTime(appointment.startTime)}–${formatTime(appointment.blockEndTime || appointment.endTime)}</div>
      <div class="small text-muted mt-1">${escapeHtml(appointment.reason)}</div>
      <a class="btn btn-sm btn-soft mt-2 me-1" href="patient-record.html?patient=${encodeURIComponent(patient.patientId)}">Patient chart</a>
      ${appointment.status === 'Booked' ? `<button class="btn btn-sm btn-outline-danger mt-2" data-cancel="${escapeHtml(appointment.appointmentId)}">Cancel appointment</button>` : ''}
    </article>`;
  }).join('') : emptyState({ icon: 'bi-calendar2-x', title: 'No appointments found', text: 'Try another status filter or search term.' });
  const upcoming = ctxRef.data.appointments.filter((appointment) =>
    appointment.status === 'Booked' && appointment.date > todayISO(),
  ).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 6);
  $('#upcomingAppointments').innerHTML = upcoming.length
    ? upcoming.map((appointment) => `<div class="d-flex flex-wrap justify-content-between gap-2 border rounded-4 p-2 mb-2"><span><strong>${escapeHtml(patientOf(appointment).name)}</strong> · ${escapeHtml(doctorOf(appointment).name)}</span><span class="small">${formatDate(appointment.date)} · ${formatTime(appointment.startTime)}</span></div>`).join('')
    : '<p class="small text-muted">No upcoming appointments.</p>';
}

function refreshEmergencyWalkInSlots() {
  const doctorId = $('#walkinDoctor').value;
  const available = doctorId ? emergencyBuffers(ctxRef.data, doctorId) : [];
  $('#walkinEmergencySlot').innerHTML = '<option value="">Choose a verified emergency buffer</option>' +
    available.map((slot) => `<option value="${escapeHtml(slot.slotId)}">${formatDate(slot.date)} · ${formatTime(slot.emergencyBufferStartTime)}–${formatTime(slot.emergencyBufferEndTime)}</option>`).join('');
}

async function renderClinicRegistrationQr() {
  const url = new URL('patient-register.html?handoff=1', window.location.href).href;
  $('#clinicRegistrationLink').href = url;
  $('#clinicRegistrationLink').textContent = url;
  try {
    const { makeQrDataUrl } = await import('../logic/qrCode.js');
    $('#clinicRegistrationQr').src = makeQrDataUrl(url, 4);
  } catch (error) {
    $('#clinicRegistrationQr').removeAttribute('src');
    scannerMessage(`Could not generate the clinic registration QR: ${error.message}`, 'danger');
  }
}

function reviewHandoff(payload) {
  const result = parsePatientHandoff(payload);
  state.pendingHandoff = result.ok ? { payload: result.payload, patient: result.patient } : null;
  if (!result.ok) {
    $('#handoffPreview').innerHTML = `<div class="alert alert-warning" role="alert">${escapeHtml(result.message)}</div>`;
    return;
  }
  const patient = result.patient;
  $('#manualHandoffPayload').value = result.payload;
  $('#handoffPreview').innerHTML = `<div class="summary-box">
    <h3 class="h6">Review before importing</h3>
    <p class="mb-1"><strong>${escapeHtml(patient.name)}</strong> · ${escapeHtml(patient.phone)}</p>
    <p class="small mb-1">${escapeHtml(patient.email || 'No email')} · Age ${escapeHtml(patient.age)} · ${escapeHtml(patient.gender)}</p>
    <p class="small mb-2">${escapeHtml(patient.address)}</p>
    <button type="button" class="btn btn-sm btn-primary" data-import-handoff>Confirm import to this clinic browser</button>
  </div>`;
}

function importReviewedHandoff() {
  if (!state.pendingHandoff) return;
  const result = importPatientHandoff({ payload: state.pendingHandoff.payload, actor: ctxRef.session });
  if (!result.ok) {
    $('#handoffPreview').insertAdjacentHTML('beforeend', `<div class="alert alert-warning mt-2" role="alert">${escapeHtml(result.message)}</div>`);
    if (result.patient) {
      state.patientSearch = result.patient.phone;
      $('#patientSearch').value = result.patient.phone;
      state.selectedPatientId = result.patient.patientId;
      renderPatientSearch();
    }
    return;
  }
  const { patient } = result;
  state.pendingHandoff = null;
  state.patientSearch = patient.phone;
  $('#patientSearch').value = patient.phone;
  state.selectedPatientId = patient.patientId;
  $('#handoffPreview').innerHTML = `<div class="alert alert-success" role="status">${escapeHtml(patient.name)} imported. Select them and add them to the walk-in queue.</div>`;
  toast('Patient handoff imported.', 'success');
  ctxRef.refresh();
}

function scannerMessage(message, variant = 'info') {
  $('#scannerStatus').innerHTML = `<div class="alert alert-${variant} py-2 mb-0" role="${variant === 'danger' ? 'alert' : 'status'}">${escapeHtml(message)}</div>`;
}

function stopScanner(message = 'Scanner stopped.') {
  scannerActive = false;
  if (scannerFrame !== null) cancelAnimationFrame(scannerFrame);
  scannerFrame = null;
  scannerStream?.getTracks().forEach((track) => track.stop());
  scannerStream = null;
  const video = $('#qrVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.classList.add('d-none');
  }
  $('#startScanner').disabled = false;
  $('#stopScanner').disabled = true;
  if (message) scannerMessage(message);
}

async function scanFrame(detector) {
  if (!scannerActive || scannerBusy) return;
  const video = $('#qrVideo');
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    scannerBusy = true;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        const payload = codes[0].rawValue;
        if (payload.startsWith(HANDOFF_PREFIX)) {
          stopScanner('Handoff scanned. Review the details below before importing.');
          reviewHandoff(payload);
          return;
        }
        const result = checkInAppointmentByQr({ payload, actor: ctxRef.session });
        if (result.ok) {
          stopScanner(`${patientOf(result.appointment).name} checked in and added to the waiting queue.`);
          toast('Appointment checked in.', 'success');
          ctxRef.refresh();
          return;
        }
        scannerMessage(result.message, 'warning');
      }
    } catch (error) {
      scannerMessage(`Could not read the camera frame: ${error.message}`, 'danger');
    } finally {
      scannerBusy = false;
    }
  }
  if (scannerActive) scannerFrame = requestAnimationFrame(() => scanFrame(detector));
}

async function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    scannerMessage('Camera access is not available in this browser or origin.', 'danger');
    return;
  }
  if (!('BarcodeDetector' in window)) {
    scannerMessage('This browser does not support built-in QR decoding. Use a current Chromium browser on localhost or HTTPS.', 'warning');
    return;
  }
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    scannerMessage('Requesting camera permission…');
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const video = $('#qrVideo');
    video.srcObject = scannerStream;
    video.classList.remove('d-none');
    await video.play();
    scannerActive = true;
    $('#startScanner').disabled = true;
    $('#stopScanner').disabled = false;
    scannerMessage('Camera active. Scan an appointment QR or a patient handoff QR.');
    scanFrame(detector);
  } catch (error) {
    stopScanner('');
    scannerMessage(error.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access in browser settings and try again.'
      : `Unable to start camera: ${error.message}`, 'danger');
  }
}

function doctorFormValues() {
  return {
    staffId: $('#doctorStaffId').value,
    name: $('#doctorName').value,
    specialty: $('#doctorSpecialty').value,
    experience: $('#doctorExperience').value,
    room: $('#doctorRoom').value,
    consultationFee: $('#doctorFee').value,
    qualification: $('#doctorQualification').value,
    bio: $('#doctorBio').value,
  };
}

function resetDoctorForm() {
  state.editingDoctorId = null;
  $('#doctorForm').reset();
  $('#doctorStaffId').disabled = false;
  $('#saveDoctor').textContent = 'Add doctor';
  $('#cancelDoctorEdit').classList.add('d-none');
  $('#doctorFormAlert').innerHTML = '';
}

function renderDoctorManagement() {
  $('#doctorList').innerHTML = ctxRef.data.doctors.slice().sort((a, b) => a.name.localeCompare(b.name)).map((doctor) => `
    <article class="border rounded-4 p-3 mb-2">
      <div class="d-flex flex-wrap justify-content-between gap-2">
        <div><strong>${escapeHtml(doctor.name)}</strong><div class="small text-muted">${escapeHtml(doctor.staffId)} · ${escapeHtml(doctor.specialty)} · ${escapeHtml(doctor.room)}</div></div>
        ${statusBadge(doctor.status === 'active' ? 'Available' : 'Unavailable')}
      </div>
      <div class="d-flex flex-wrap gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-soft" data-edit-doctor="${escapeHtml(doctor.doctorId)}">Edit</button>
        <button type="button" class="btn btn-sm ${doctor.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'}" data-toggle-doctor="${escapeHtml(doctor.doctorId)}" data-active="${doctor.status === 'active'}">${doctor.status === 'active' ? 'Deactivate' : 'Activate'}</button>
      </div>
    </article>`).join('') || '<p class="small text-muted">No doctors have been added.</p>';
}

function bindEvents() {
  $('#patientSearch').addEventListener('input', (event) => {
    state.patientSearch = event.target.value;
    renderPatientSearch();
  });
  $('#patientSearchResults').addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-patient]');
    if (!button) return;
    state.selectedPatientId = button.dataset.selectPatient;
    renderPatientSearch();
  });
  $('#addExistingToQueue').addEventListener('click', () => {
    const result = addWalkInToQueue({
      patientId: state.selectedPatientId,
      doctorId: $('#walkinDoctor').value || null,
      referralDoctorId: $('#referralDoctor').value || null,
      referralReason: $('#referralReason').value,
      actor: ctxRef.session,
    });
    if (!result.ok) {
      $('#walkinAlert').innerHTML = `<div class="alert alert-warning" role="alert">${escapeHtml(result.message)}</div>`;
      return;
    }
    $('#walkinAlert').innerHTML = `<div class="alert alert-success" role="status">${escapeHtml(result.patient.name)} added to the walk-in queue.</div>`;
    toast('Patient added to the queue.');
    ctxRef.refresh();
  });
  $('#assignEmergencyWalkIn').addEventListener('click', () => {
    const result = assignEmergencyWalkIn({
      patientId: state.selectedPatientId,
      doctorId: $('#walkinDoctor').value,
      slotId: $('#walkinEmergencySlot').value,
      actor: ctxRef.session,
    });
    if (!result.ok) {
      $('#walkinAlert').innerHTML = `<div class="alert alert-warning" role="alert">${escapeHtml(result.message)}</div>`;
      return;
    }
    $('#walkinAlert').innerHTML = `<div class="alert alert-success" role="status">${escapeHtml(result.patient.name)} verified and assigned emergency buffer with ${escapeHtml(result.doctor.name)}.</div>`;
    toast('Verified emergency walk-in assigned.', 'success');
    ctxRef.refresh();
  });
  $('#walkinDoctor').addEventListener('change', refreshEmergencyWalkInSlots);
  $('#waitingQueue').addEventListener('click', handleQueueAction);
  $('#consultingQueue').addEventListener('click', handleQueueAction);
  $('#completedQueue').addEventListener('click', handleQueueAction);
  $('#emergencyAlerts').addEventListener('click', async (event) => {
    const approveButton = event.target.closest('[data-emergency-approve]');
    const rejectButton = event.target.closest('[data-emergency-reject]');
    if (approveButton) {
      const requestId = approveButton.dataset.emergencyApprove;
      const result = approveEmergencyRequest({
        requestId,
        actor: ctxRef.session,
      });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Emergency appointment approved and confirmed.', 'success');
      ctxRef.refresh();
    } else if (rejectButton) {
      const confirmed = await confirmDialog({
        title: 'Reject this emergency request?',
        body: 'The patient will see the rejected status. The request remains in emergency history.',
        confirmText: 'Reject request', icon: 'bi-exclamation-triangle',
      });
      if (!confirmed) return;
      const result = rejectEmergencyRequest({ requestId: rejectButton.dataset.emergencyReject, actor: ctxRef.session });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Emergency request rejected and retained in history.', 'info');
      ctxRef.refresh();
    } else {
      const importButton = event.target.closest('[data-import-handoff]');
      if (importButton) importReviewedHandoff();
    }
  });
  $('#reviewManualHandoff').addEventListener('click', () => reviewHandoff($('#manualHandoffPayload').value));
  $('#handoffFileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      reviewHandoff(await file.text());
    } catch (error) {
      $('#handoffPreview').innerHTML = `<div class="alert alert-danger" role="alert">Could not read the handoff file: ${escapeHtml(error.message)}</div>`;
    }
    event.target.value = '';
  });
  $('#doctorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearFieldErrors(form);
    const wasEditing = Boolean(state.editingDoctorId);
    const result = wasEditing
      ? updateDoctor({ doctorId: state.editingDoctorId, doctor: doctorFormValues(), actor: ctxRef.session })
      : addDoctor({ doctor: doctorFormValues(), actor: ctxRef.session });
    if (!result.ok) {
      if (result.errors) showFieldErrors(form, result.errors);
      $('#doctorFormAlert').innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(result.message)}</div>`;
      return;
    }
    resetDoctorForm();
    $('#doctorFormAlert').innerHTML = `<div class="alert alert-success" role="status">${escapeHtml(result.doctor.name)} saved.</div>`;
    toast(wasEditing ? 'Doctor updated.' : 'Doctor added.', 'success');
    ctxRef.refresh();
  });
  $('#doctorList').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-doctor]');
    const toggle = event.target.closest('[data-toggle-doctor]');
    if (edit) {
      const doctor = ctxRef.data.doctors.find((entry) => entry.doctorId === edit.dataset.editDoctor);
      if (!doctor) return;
      state.editingDoctorId = doctor.doctorId;
      $('#doctorStaffId').value = doctor.staffId;
      $('#doctorName').value = doctor.name;
      $('#doctorSpecialty').value = doctor.specialty;
      $('#doctorExperience').value = doctor.experience;
      $('#doctorRoom').value = doctor.room;
      $('#doctorFee').value = doctor.consultationFee ?? '';
      $('#doctorQualification').value = doctor.qualification || '';
      $('#doctorBio').value = doctor.bio || '';
      $('#saveDoctor').textContent = 'Save doctor details';
      $('#cancelDoctorEdit').classList.remove('d-none');
      $('#doctorStaffId').focus();
    } else if (toggle) {
      const activating = toggle.dataset.active === 'true';
      const confirmed = await confirmDialog({
        title: activating ? 'Deactivate this doctor?' : 'Activate this doctor?',
        body: activating
          ? 'Existing appointments and records will remain. This doctor will no longer receive new bookings or assignments.'
          : 'This doctor will become available for new directory bookings and assignments.',
        confirmText: activating ? 'Deactivate doctor' : 'Activate doctor',
        variant: activating ? 'danger' : 'primary',
      });
      if (!confirmed) return;
      const result = setDoctorActive({ doctorId: toggle.dataset.toggleDoctor, active: !activating, actor: ctxRef.session });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Doctor status updated.', 'success');
      ctxRef.refresh();
    }
  });
  $('#cancelDoctorEdit').addEventListener('click', resetDoctorForm);
  $('#doctorId').addEventListener('change', refreshSlots);
  $('#appointmentDate').addEventListener('change', refreshSlots);
  $('#appointmentDate').value = todayISO();
  $('#deskBookingForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const result = bookAppointment({
      slotId: $('#slotId').value,
      patientId: $('#patientId').value,
      reason: $('#reason').value,
      actor: ctxRef.session,
    });
    if (!result.ok) {
      $('#bookingAlert').innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(result.message)}</div>`;
      ctxRef.refresh();
      refreshSlots();
      return;
    }
    $('#deskBookingForm').reset();
    $('#appointmentDate').value = todayISO();
    $('#bookingAlert').innerHTML = `<div class="alert alert-success" role="status">Scheduled appointment booked for ${escapeHtml(result.patient.name)}.</div>`;
    toast('Scheduled appointment booked.');
    ctxRef.refresh();
    refreshSlots();
  });
  $('#statusFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.dataset.filter;
    $('#statusFilters').querySelectorAll('[data-filter]').forEach((item) =>
      item.className = `btn btn-sm ${item === button ? 'btn-primary' : 'btn-soft'}`,
    );
    renderAppointments();
  });
  $('#appointmentSearch').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderAppointments();
  });
  $('#appointmentRegister').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-cancel]');
    if (!button) return;
    const appointment = ctxRef.data.appointments.find((entry) => entry.appointmentId === button.dataset.cancel);
    const confirmed = await confirmDialog({ title: 'Cancel this appointment?', body: 'The appointment remains in cancellation history and the regular slot becomes available again.', confirmText: 'Cancel appointment', icon: 'bi-calendar2-x' });
    if (!confirmed) return;
    const result = cancelAppointment({ appointmentId: appointment.appointmentId, actor: ctxRef.session });
    if (!result.ok) toast(result.message, 'danger');
    else toast('Appointment cancelled.', 'success');
    ctxRef.refresh();
  });
  $('#startScanner').addEventListener('click', startScanner);
  $('#stopScanner').addEventListener('click', () => stopScanner());
  window.addEventListener('beforeunload', () => stopScanner(''));
}

function handleQueueAction(event) {
  const statusButton = event.target.closest('[data-queue-status]');
  if (!statusButton) return;
  const result = updateQueueStatus({
    queueId: statusButton.dataset.queueStatus,
    status: statusButton.dataset.nextStatus,
    actor: ctxRef.session,
  });
  if (!result.ok) toast(result.message, 'danger');
  else toast(`Queue status updated to ${result.queueEntry.status}.`, 'success');
  ctxRef.refresh();
}

function render() {
  renderSelectors();
  renderStats();
  renderEmergencyAlerts();
  renderPatientSearch();
  renderQueue();
  renderAppointments();
  renderDoctorManagement();
  refreshEmergencyWalkInSlots();
  refreshSlots();
  if (!$('#clinicRegistrationQr').getAttribute('src')) renderClinicRegistrationQr();
}

initPage({
  page: 'receptionist',
  render(ctx, { isRefresh }) {
    ctxRef = ctx;
    if (!isRefresh) bindEvents();
    render();
  },
});
