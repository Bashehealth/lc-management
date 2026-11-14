import test from "node:test";
import assert from "node:assert/strict";
import { canDecideMonthlyTimesheet, summarizeWorkingDayEntries } from "../src/lib/monthly-timesheet.mjs";
import { programmeStates } from "../src/lib/programme-states.mjs";

test("programme state directory has exactly 15 unique entries including Kaduna once", () => {
  const expected = ["Yobe State", "Borno State", "Bauchi State", "Gombe State", "Adamawa State", "Jigawa State", "Kano State", "Kaduna State", "Katsina State", "Zamfara State", "Sokoto State", "Kebbi State", "Niger State", "Nasarawa State", "Kogi State"];
  assert.equal(programmeStates.length, 15);
  assert.deepEqual(programmeStates.map((state) => state.name), expected);
  assert.equal(new Set(programmeStates.map((state) => state.code)).size, 15);
  assert.equal(programmeStates.filter((state) => state.name === "Kaduna State").length, 1);
});

test("verified totals include approved days only and keep source entries traceable", () => {
  const summary = summarizeWorkingDayEntries([
    { id: "1", working_date: "2026-11-01", status: "approved" },
    { id: "2", working_date: "2026-11-02", status: "claimed" },
    { id: "3", working_date: "2026-11-03", status: "rejected" },
    { id: "4", working_date: "2026-11-04", status: "returned" },
    { id: "5", working_date: "2026-12-01", status: "approved" },
  ], "2026-11");

  assert.deepEqual({ total: summary.totalSubmitted, verified: summary.verified, pending: summary.pending, rejected: summary.rejected, returned: summary.returned },
    { total: 4, verified: 1, pending: 1, rejected: 1, returned: 1 });
  assert.deepEqual(summary.sourceRecords.map((record) => record.id), ["1", "2", "3", "4"]);
  assert.equal(summary.eligibility, "incomplete");
});

test("duplicate dates cannot inflate totals and approved status wins for a date", () => {
  const summary = summarizeWorkingDayEntries([
    { id: "pending", working_date: "2026-11-08", status: "claimed" },
    { id: "approved", working_date: "2026-11-08", status: "approved" },
    { id: "duplicate", working_date: "2026-11-08", status: "approved" },
  ], "2026-11");

  assert.equal(summary.totalSubmitted, 1);
  assert.equal(summary.verified, 1);
  assert.equal(summary.sourceRecords.length, 1);
  assert.equal(summary.eligibility, "ready_for_review");
});

test("an empty month is unavailable for payment eligibility, not zero payable", () => {
  const summary = summarizeWorkingDayEntries([], "2026-11");
  assert.equal(summary.totalSubmitted, 0);
  assert.equal(summary.verified, 0);
  assert.equal(summary.eligibility, "no_records");
});

test("only Boss can decide a submitted timesheet with a required note", () => {
  assert.equal(canDecideMonthlyTimesheet("boss", "submitted", "Reviewed and verified"), true);
  assert.equal(canDecideMonthlyTimesheet("dpm", "submitted", "Reviewed and verified"), false);
  assert.equal(canDecideMonthlyTimesheet("boss", "approved", "Duplicate decision"), false);
  assert.equal(canDecideMonthlyTimesheet("boss", "submitted", "  "), false);
});
