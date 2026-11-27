import { initPage, $, $$, escapeHtml, emptyState, statusBadge, toast } from '../ui/common.js';
import { patientChart, saveClinicalRecord } from '../logic/consultationService.js';
import { updateEmergencyCase } from '../logic/emergencyService.js';
import { updateDoctorQueueStatus } from '../logic/receptionService.js';
import { formatDate, formatTime } from '../logic/dateUtils.js';

const params = new URLSearchParams(window.location.search);
const patientId = params.get('patient');
const appointmentId = params.get('appointment') || params.get('appointmentId');
const encounterId = params.get('encounterId');
let ctxRef;
let amendmentId = null;

const doctorFor = (id) => ctxRef.data.doctors.find((doctor) => doctor.doctorId === id) || null;
const dateFromStamp = (stamp) => stamp ? String(stamp).slice(0, 10) : '';

function renderPatient(patient) {
  $('#patientRecordTitle').textContent = `${patient.name} · Patient chart`;
  document.title = `Patient record · ${patient.name} · ClinicBook`;
  $('#patientInformation').innerHTML = `<h2 class="h5" id="patientInformationTitle">Patient information</h2>
    <dl class="row mb-0">
      <dt class="col-sm-3">Patient ID</dt><dd class="col-sm-9">${escapeHtml(patient.patientId)}</dd>
      <dt class="col-sm-3">Full name</dt><dd class="col-sm-9">${escapeHtml(patient.name)}</dd>
      <dt class="col-sm-3">Mobile</dt><dd class="col-sm-9">${escapeHtml(patient.phone)}</dd>
      <dt class="col-sm-3">Email</dt><dd class="col-sm-9">${escapeHtml(patient.email || 'Not provided')}</dd>
      <dt class="col-sm-3">Age</dt><dd class="col-sm-9">${escapeHtml(patient.age ?? 'Not provided')}</dd>
      <dt class="col-sm-3">Gender</dt><dd class="col-sm-9">${escapeHtml(patient.gender || 'Not provided')}</dd>
      <dt class="col-sm-3">Address</dt><dd class="col-sm-9">${escapeHtml(patient.address || 'Not provided')}</dd>
    </dl>`;
}

function renderEncounters(chart) {
  const entries = [
    ...chart.appointments.map((appointment) => ({
      type: 'Scheduled appointment',
      date: appointment.date,
      time: formatTime(appointment.startTime),
      doctor: doctorFor(appointment.doctorId)?.name || 'Unknown doctor',
      status: appointment.status,
      detail: appointment.reason,
    })),
    ...chart.queueEntries.map((entry) => ({
      type: entry.entryType === 'EmergencyWalkIn' ? 'Verified emergency walk-in' :
        entry.entryType === 'ScheduledCheckIn' ? 'Scheduled appointment check-in' : 'Walk-in',
      date: dateFromStamp(entry.createdAt),
      time: new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      doctor: doctorFor(entry.doctorId)?.name || 'Not assigned',
      status: entry.status,
      detail: entry.referralReason || '',
    })),
    ...chart.emergencyRequests.map((request) => ({
      type: request.legacyDecision ? `Legacy emergency decision (${request.legacyStatus})` : 'Emergency request',
      date: dateFromStamp(request.createdAt),
      time: new Date(request.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      doctor: doctorFor(request.doctorId)?.name || 'Not assigned',
      status: request.status,
      detail: request.reason,
    })),
  ].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  $('#encounterHistory').innerHTML = entries.length
    ? `<div class="d-grid gap-2">${entries.map((entry) => `<article class="border rounded-4 p-3">
        <div class="d-flex flex-wrap justify-content-between gap-2"><strong>${escapeHtml(entry.type)}</strong>${statusBadge(entry.status)}</div>
        <div class="small text-muted">${escapeHtml(entry.date)} · ${escapeHtml(entry.time)} · ${escapeHtml(entry.doctor)}</div>
        ${entry.detail ? `<p class="small mb-0 mt-2">${escapeHtml(entry.detail)}</p>` : ''}
      </article>`).join('')}</div>`
    : '<p class="small text-muted mb-0">No appointments or clinic encounters are available.</p>';
}

function recordCard(record) {
  const { consultation, prescriptions, appointment, encounter, doctor } = record;
  const visitDate = appointment?.date || dateFromStamp(consultation.createdAt);
  const encounterLabel = consultation.recordType === 'Amendment' ? 'Amendment' : consultation.encounterType;
  return `<article class="border rounded-4 p-3 mb-3">
    <div class="d-flex flex-wrap justify-content-between gap-2">
      <div><h3 class="h6 mb-1">${escapeHtml(encounterLabel || 'Consultation')} · ${escapeHtml(visitDate)}</h3>
        <div class="small text-muted">${escapeHtml(doctor?.name || 'Doctor not found')}${appointment ? ` · ${formatTime(appointment.startTime)}` : ''}</div>
      </div>
      ${consultation.recordType === 'Amendment' ? '<span class="badge text-bg-warning">AMENDMENT</span>' : ''}
    </div>
    ${consultation.amendsConsultationId ? `<p class="small text-muted mt-2 mb-2">Amends record ${escapeHtml(consultation.amendsConsultationId)}; original record is retained.</p>` : ''}
    ${consultation.chiefComplaint ? `<h4 class="small fw-bold mt-3">Chief complaint</h4><p class="mb-2">${escapeHtml(consultation.chiefComplaint)}</p>` : ''}
    ${consultation.diagnosis ? `<h4 class="small fw-bold mt-3">Diagnosis</h4><p class="mb-2">${escapeHtml(consultation.diagnosis)}</p>` : ''}
    ${consultation.symptoms ? `<h4 class="small fw-bold mt-3">Symptoms / observations</h4><p class="mb-2">${escapeHtml(consultation.symptoms)}</p>` : ''}
    ${consultation.treatmentPlan ? `<h4 class="small fw-bold mt-3">Treatment plan</h4><p class="mb-2">${escapeHtml(consultation.treatmentPlan)}</p>` : ''}
    <h4 class="small fw-bold mt-3">Consultation notes</h4><p class="mb-2">${escapeHtml(consultation.notes || 'No notes recorded.')}</p>
    <h4 class="small fw-bold mt-3">Prescription</h4>
    ${prescriptions.length ? `<ul class="mb-2">${prescriptions.map((medicine) => `<li><strong>${escapeHtml(medicine.medicineName)}</strong> — ${escapeHtml(medicine.dosage)}, ${escapeHtml(medicine.frequency)}, ${escapeHtml(medicine.duration)}. ${escapeHtml(medicine.instructions)}</li>`).join('')}</ul>` : '<p class="small text-muted">No medicines prescribed.</p>'}
    ${consultation.referralRequired ? `<h4 class="small fw-bold mt-3">Referral</h4>
      <p class="mb-1">${escapeHtml(consultation.referralDoctor)} · ${escapeHtml(consultation.referralReason)}</p>
      ${consultation.referralInstructions ? `<p class="small mb-0">${escapeHtml(consultation.referralInstructions)}</p>` : ''}` : ''}
    ${encounter?.reason ? `<div class="small text-muted mt-2">Emergency reason: ${escapeHtml(encounter.reason)}</div>` : ''}
  </article>`;
}

function renderClinicalHistory(chart) {
  $('#clinicalHistory').innerHTML = chart.records.length
    ? chart.records.map(recordCard).join('')
    : emptyState({ icon: 'bi-file-medical', title: 'No consultation records yet', text: 'Saved consultations and prescriptions will appear here.' });
}

function medicineRow(medicine = {}) {
  const fields = [
    ['medicineName', 'Medicine name'],
    ['dosage', 'Dosage'],
    ['frequency', 'Frequency'],
    ['duration', 'Duration'],
    ['instructions', 'Instructions'],
  ];
  return `<div class="medicine-row border rounded-4 p-3">
    <div class="row g-2">${fields.map(([name, label]) => `<div class="col-md-6">
      <label class="form-label small">${label}</label>
      <input class="form-control" data-medicine-field="${name}" value="${escapeHtml(medicine[name] || '')}" maxlength="240">
    </div>`).join('')}</div>
    <button type="button" class="btn btn-sm btn-link text-danger px-0 mt-2" data-remove-medicine>Remove medicine</button>
  </div>`;
}

function valuesForAmendment(record) {
  const consultation = record.consultation;
  $('#chiefComplaint').value = consultation.chiefComplaint || '';
  $('#diagnosis').value = consultation.diagnosis || '';
  $('#symptoms').value = consultation.symptoms || '';
  $('#treatmentPlan').value = consultation.treatmentPlan || '';
  $('#consultationNotes').value = consultation.notes || '';
  $('#referralRequired').checked = Boolean(consultation.referralRequired);
  $('#referralDoctor').value = consultation.referralDoctor || '';
  $('#referralReason').value = consultation.referralReason || '';
  $('#referralInstructions').value = consultation.referralInstructions || '';
  $('#referralFields').classList.toggle('d-none', !consultation.referralRequired);
  $('#prescriptionRows').innerHTML = record.prescriptions.length
    ? record.prescriptions.map(medicineRow).join('')
    : medicineRow();
  amendmentId = consultation.consultationId;
}

function encounterRecord(chart) {
  return chart.records.find((record) =>
    appointmentId
      ? record.consultation.appointmentId === appointmentId
      : record.consultation.encounterId === encounterId,
  ) || null;
}

function openDoctorEditor(chart) {
  const session = ctxRef.session;
  if (session.role !== 'doctor' || (!appointmentId && !encounterId)) return;
  let summary = '';
  let source = null;
  if (appointmentId) {
    source = ctxRef.data.appointments.find((entry) => entry.appointmentId === appointmentId);
    if (!source || source.patientId !== patientId || source.doctorId !== session.doctorId) {
      $('#recordAlert').innerHTML = '<div class="alert alert-danger" role="alert">This appointment is not assigned to your doctor account.</div>';
      return;
    }
    summary = `Appointment · ${source.date} · ${formatTime(source.startTime)} · ${source.reason}`;
  } else {
    source = (ctxRef.data.queueEntries || []).find((entry) => entry.queueId === encounterId) ||
      (ctxRef.data.emergencyRequests || []).find((entry) => entry.requestId === encounterId);
    if (!source || source.patientId !== patientId || source.doctorId !== session.doctorId) {
      $('#recordAlert').innerHTML = '<div class="alert alert-danger" role="alert">This encounter is not assigned to your doctor account.</div>';
      return;
    }
    if (source.requestId && !['Approved', 'In Progress', 'Completed'].includes(source.status)) {
      $('#recordAlert').innerHTML = '<div class="alert alert-warning" role="alert">Emergency cases are visible to doctors only after receptionist approval.</div>';
      return;
    }
    summary = `${source.requestId ? 'Approved emergency case' : source.entryType} · ${new Date(source.createdAt).toLocaleString()}`;
  }

  const section = $('#consultationSection');
  section.classList.remove('d-none');
  $('#recordEncounterSummary').textContent = summary;
  const existing = encounterRecord(chart);
  $('#existingEncounterRecord').innerHTML = existing
    ? `<div class="alert alert-info" role="status">A consultation already exists for this visit. It is read-only; use the amendment action to add a correction without changing the original.</div>${recordCard(existing)}`
    : '<p class="small text-muted">No consultation has been saved for this encounter yet.</p>';
  $('#consultationForm').classList.toggle('d-none', Boolean(existing));
  $('#startAmendment').classList.toggle('d-none', !existing);
  $('#consultationForm').reset();
  $('#amendmentNotice').classList.add('d-none');
  $('#prescriptionRows').innerHTML = medicineRow();
  $('#referralFields').classList.add('d-none');
  $('#consultationAlert').innerHTML = '';
  amendmentId = null;

  const actions = $('#encounterActions');
  actions.innerHTML = '';
  if (source.requestId && source.status === 'In Progress' && existing) {
    actions.innerHTML = '<button type="button" class="btn btn-outline-success" data-complete-emergency>Complete emergency case</button>';
  } else if (source.queueId && ['WalkIn', 'EmergencyWalkIn'].includes(source.entryType) && source.status === 'Consulting' && existing) {
    actions.innerHTML = '<button type="button" class="btn btn-outline-success" data-complete-walkin>Complete walk-in</button>';
  }
}

function collectPrescriptions() {
  return $$('.medicine-row', $('#prescriptionRows')).map((row) => {
    const medicine = {};
    $$('[data-medicine-field]', row).forEach((input) => { medicine[input.dataset.medicineField] = input.value; });
    return medicine;
  }).filter((medicine) => Object.values(medicine).some((value) => value.trim()));
}

function bindEvents() {
  $('#consultationForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const result = saveClinicalRecord({
      appointmentId,
      encounterId,
      chiefComplaint: $('#chiefComplaint').value,
      diagnosis: $('#diagnosis').value,
      symptoms: $('#symptoms').value,
      treatmentPlan: $('#treatmentPlan').value,
      notes: $('#consultationNotes').value,
      prescriptions: collectPrescriptions(),
      referralRequired: $('#referralRequired').checked,
      referralDoctor: $('#referralDoctor').value,
      referralReason: $('#referralReason').value,
      referralInstructions: $('#referralInstructions').value,
      amendsConsultationId: amendmentId,
      actor: ctxRef.session,
    });
    if (!result.ok) {
      $('#consultationAlert').innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(result.message)} ${escapeHtml(Object.values(result.errors || {}).join(' '))}</div>`;
      return;
    }
    toast(amendmentId ? 'Clinical amendment saved; the original is unchanged.' : 'Consultation saved.', 'success');
    amendmentId = null;
    ctxRef.refresh();
  });
  $('#consultationForm').addEventListener('click', (event) => {
    if (event.target.closest('[data-add-medicine]')) $('#prescriptionRows').insertAdjacentHTML('beforeend', medicineRow());
    const remove = event.target.closest('[data-remove-medicine]');
    if (remove) {
      const rows = $$('.medicine-row', $('#prescriptionRows'));
      if (rows.length === 1) rows[0].querySelectorAll('input').forEach((input) => { input.value = ''; });
      else remove.closest('.medicine-row').remove();
    }
  });
  $('#referralRequired').addEventListener('change', (event) => {
    $('#referralFields').classList.toggle('d-none', !event.target.checked);
  });
  $('#startAmendment').addEventListener('click', () => {
    const chart = patientChart(ctxRef.data, patientId, ctxRef.session);
    if (!chart.ok) return;
    const record = encounterRecord(chart);
    if (!record) return;
    valuesForAmendment(record);
    $('#consultationForm').classList.remove('d-none');
    $('#amendmentNotice').classList.remove('d-none');
    $('#startAmendment').classList.add('d-none');
  });
  $('#encounterActions').addEventListener('click', (event) => {
    if (event.target.closest('[data-complete-emergency]')) {
      const result = updateEmergencyCase({ requestId: encounterId, status: 'Completed', actor: ctxRef.session });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Emergency case completed.', 'success');
      ctxRef.refresh();
    }
    if (event.target.closest('[data-complete-walkin]')) {
      const result = updateDoctorQueueStatus({ queueId: encounterId, status: 'Completed', actor: ctxRef.session });
      if (!result.ok) toast(result.message, 'danger');
      else toast('Walk-in completed.', 'success');
      ctxRef.refresh();
    }
  });
}

function render(ctx, { isRefresh }) {
  ctxRef = ctx;
  const result = patientChart(ctx.data, patientId, ctx.session);
  if (!result.ok) {
    $('#recordAlert').innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(result.message)}</div>`;
    return;
  }
  renderPatient(result.patient);
  renderEncounters(result);
  renderClinicalHistory(result);
  openDoctorEditor(result);
  if (!isRefresh) bindEvents();
}

initPage({
  page: 'patient-record',
  render,
});
