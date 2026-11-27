export function matchesSpecialty(doctor, query = '') {
  return !query || doctor.specialty.toLowerCase().includes(query.trim().toLowerCase());
}

export function doctorProfileHref(doctorId) {
  return `book.html?doctor=${encodeURIComponent(doctorId)}`;
}
