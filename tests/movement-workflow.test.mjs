import test from "node:test";
import assert from "node:assert/strict";
import {
  canManagementDecide,
  canLgaResubmit,
  canStateReview,
  hasRequiredDecisionNote,
  managementDecisionStatuses,
  validateMovementSubmission,
} from "../src/lib/movement-workflow.mjs";

test("management may decide only after State forwards a request", () => {
  assert.equal(canManagementDecide("pending_management"), true);
  assert.equal(canManagementDecide("pending_state_review"), false);
  assert.equal(canManagementDecide("returned_to_lga"), false);
  assert.deepEqual(managementDecisionStatuses, ["pending_management", "approved", "rejected"]);
});

test("only a returned LGA request may be resubmitted", () => {
  assert.equal(canLgaResubmit("returned_to_lga"), true);
  assert.equal(canLgaResubmit("pending_state_review"), false);
  assert.equal(canLgaResubmit("pending_management"), false);
});

test("State may review pending or returned requests only", () => {
  assert.equal(canStateReview("pending_state_review"), true);
  assert.equal(canStateReview("returned_to_lga"), true);
  assert.equal(canStateReview("pending_management"), false);
  assert.equal(canStateReview("approved"), false);
});

test("decision note must contain at least three non-whitespace characters", () => {
  assert.equal(hasRequiredDecisionNote("  "), false);
  assert.equal(hasRequiredDecisionNote("ok"), false);
  assert.equal(hasRequiredDecisionNote(" valid "), true);
});

test("movement submission rejects missing fields and invalid date order", () => {
  assert.match(validateMovementSubmission({ destination: "", reason: "reason", departure: "2026-11-01T08:00", expectedReturn: "2026-11-01T10:00" }), /required/);
  assert.match(validateMovementSubmission({ destination: "Damaturu", reason: "reason", departure: "2026-11-01T10:00", expectedReturn: "2026-11-01T08:00" }), /later/);
  assert.match(validateMovementSubmission({ destination: "Damaturu", reason: "reason", departure: "invalid", expectedReturn: "2026-11-01T08:00" }), /valid/);
  assert.equal(validateMovementSubmission({ destination: "Damaturu", reason: "official work", departure: "2026-11-01T08:00", expectedReturn: "2026-11-01T10:00" }), null);
});
