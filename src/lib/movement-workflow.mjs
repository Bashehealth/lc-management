export const managementDecisionStatuses = ["pending_management", "approved", "rejected"];

export function hasRequiredDecisionNote(note) {
  return typeof note === "string" && note.trim().length >= 3;
}

export function canStateReview(status) {
  return status === "pending_state_review" || status === "returned_to_lga";
}

export function canManagementDecide(status) {
  return status === "pending_management";
}

export function canLgaResubmit(status) {
  return status === "returned_to_lga";
}

export function validateMovementSubmission({ destination, reason, departure, expectedReturn }) {
  if (![destination, reason, departure, expectedReturn].every((value) => typeof value === "string" && value.trim())) {
    return "Complete all required movement request fields.";
  }
  const departureTime = new Date(departure).getTime();
  const returnTime = new Date(expectedReturn).getTime();
  if (!Number.isFinite(departureTime) || !Number.isFinite(returnTime)) {
    return "Enter valid departure and expected return dates.";
  }
  if (returnTime <= departureTime) {
    return "Expected return must be later than departure.";
  }
  return null;
}
