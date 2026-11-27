import { initPage, $, escapeHtml, showFieldErrors, clearFieldErrors, toast } from '../ui/common.js';
import { setSession } from '../ui/session.js';
import { registerPatient } from '../logic/patientService.js';
import { createPatientHandoff, handoffFileContents } from '../logic/qrHandoffService.js';
import { makeQrDataUrl } from '../logic/qrCode.js';

const handoffMode = new URLSearchParams(window.location.search).get('handoff') === '1';
let formValues = null;

function valuesFromForm() {
  return {
    name: $('#patientName').value,
    phone: $('#patientPhone').value,
    email: $('#patientEmail').value,
    age: $('#patientAge').value,
    gender: $('#patientGender').value,
    address: $('#patientAddress').value,
  };
}

function showRegistrationErrors(form, result) {
  if (result.errors) {
    showFieldErrors(form, result.errors);
    return;
  }
  $('#registrationAlert').innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(result.message)}</div>`;
}

function saveHandoffFile() {
  const contents = handoffFileContents(formValues.payload);
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'clinicbook-patient-handoff.json';
  link.click();
  URL.revokeObjectURL(url);
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  $('#registrationAlert').innerHTML = '';
  clearFieldErrors(form);
  const input = valuesFromForm();

  if (handoffMode) {
    const result = createPatientHandoff(input);
    if (!result.ok) {
      showRegistrationErrors(form, result);
      return;
    }
    formValues = { payload: result.payload };
    $('#handoffPayloadText').value = result.payload;
    $('#handoffResult').classList.remove('d-none');
    $('#registerPatientButton').disabled = true;
    if (result.qrReady) {
      try {
        $('#handoffQrImage').src = makeQrDataUrl(result.payload);
        $('#handoffQrImage').classList.remove('d-none');
      } catch (error) {
        $('#handoffQrImage').classList.add('d-none');
        $('#registrationAlert').innerHTML = `<div class="alert alert-warning" role="status">QR generation failed: ${escapeHtml(error.message)}. Use the download or manual handoff instead.</div>`;
      }
    } else {
      $('#handoffQrImage').classList.add('d-none');
      $('#registrationAlert').innerHTML = '<div class="alert alert-warning" role="status">These details exceed the QR size limit. Download the handoff file; no details were truncated.</div>';
    }
    toast('Registration handoff is ready.', 'success');
    return;
  }

  const result = registerPatient(input);
  if (!result.ok) {
    showRegistrationErrors(form, result);
    return;
  }
  setSession(result.session);
  $('#registrationAlert').innerHTML = '<div class="alert alert-success" role="status">Your profile was created in this browser. Opening the patient area…</div>';
  $('#registerPatientButton').disabled = true;
  setTimeout(() => { window.location.href = 'doctors.html'; }, 800);
}

initPage({
  page: 'patient-register',
  render(_ctx, { isRefresh }) {
    if (handoffMode) {
      $('#registrationTitle').textContent = 'Register for a clinic walk-in';
      $('#registrationIntro').textContent = 'Complete your details and show the one-time handoff QR to reception.';
      $('#handoffNotice').classList.remove('d-none');
      $('#registerPatientButton').textContent = 'Create handoff QR';
    }
    if (isRefresh) return;
    $('#patientRegistrationForm').addEventListener('submit', onSubmit);
    $('#patientRegistrationForm').addEventListener('input', () => clearFieldErrors($('#patientRegistrationForm')));
    $('#downloadHandoff').addEventListener('click', saveHandoffFile);
  },
});
