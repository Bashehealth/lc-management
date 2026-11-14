import test from "node:test";
import assert from "node:assert/strict";
import { contactLabel, filterBossPersonnel, mergeProgrammeStates, summarizeBossWorkingDays } from "../src/lib/boss-executive-reporting.mjs";
import { programmeStates } from "../src/lib/programme-states.mjs";

test("merges database summaries into the full 15-state directory without inventing unconfigured figures", () => {
  const states = mergeProgrammeStates(programmeStates, [{
    state_id: "state-yobe", state_code: "NG-YO", state_name: "Yobe State", registered_lgas: 2,
    active_lgas: null, lga_coordinators: 2, state_coordinators: 1, senior_supervisors: 1,
    verified_working_days: 3, pending_working_days: 1, returned_working_days: 0, rejected_working_days: 0,
  }]);

  assert.equal(states.length, 15);
  assert.equal(states[0].state_id, "state-yobe");
  assert.equal(states[0].verified_working_days, 3);
  assert.equal(states.find((state) => state.code === "NG-BO").configured, false);
  assert.equal(states.find((state) => state.code === "NG-BO").registered_lgas, null);
});

test("only approved working-day entries contribute to verified totals", () => {
  assert.deepEqual(summarizeBossWorkingDays([
    { approved_days: 2, pending_days: 0, returned_days: 0, rejected_days: 0 },
    { approved_days: 0, pending_days: 3, returned_days: 1, rejected_days: 2 },
  ]), { approved: 2, pending: 3, returned: 1, rejected: 2 });
});

test("Boss personnel filters combine role, state, LGA and name search", () => {
  const people = [
    { full_name: "Amina LC", role: "lga_coordinator", state_code: "NG-YO", lga_id: "lga-1" },
    { full_name: "Bala SC", role: "state_coordinator", state_code: "NG-YO", lga_id: null },
    { full_name: "Amina LC", role: "lga_coordinator", state_code: "NG-KN", lga_id: "lga-2" },
  ];
  assert.deepEqual(filterBossPersonnel(people, { stateCode: "NG-YO", lgaId: "lga-1", role: "lga_coordinator", search: "amina" }), [people[0]]);
});

test("missing contact values are presented honestly", () => {
  assert.equal(contactLabel(null), "Not provided");
  assert.equal(contactLabel("  "), "Not provided");
  assert.equal(contactLabel("boss@example.test"), "boss@example.test");
});
