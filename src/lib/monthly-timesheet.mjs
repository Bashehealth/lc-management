const statuses = new Set(["claimed", "approved", "returned", "rejected"]);

export function summarizeWorkingDayEntries(entries, month) {
  const firstDay = `${month}-01`;
  const nextMonth = new Date(`${firstDay}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const endExclusive = nextMonth.toISOString().slice(0, 10);
  const uniqueDays = new Map();

  for (const entry of entries ?? []) {
    if (!entry?.id || !entry.working_date || !statuses.has(entry.status)) continue;
    if (entry.working_date < firstDay || entry.working_date >= endExclusive) continue;
    const current = uniqueDays.get(entry.working_date);
    if (!current || entry.status === "approved") uniqueDays.set(entry.working_date, entry);
  }

  const sourceRecords = [...uniqueDays.values()].sort((a, b) => a.working_date.localeCompare(b.working_date));
  const totalSubmitted = sourceRecords.length;
  const verified = sourceRecords.filter((entry) => entry.status === "approved").length;
  const pending = sourceRecords.filter((entry) => entry.status === "claimed").length;
  const rejected = sourceRecords.filter((entry) => entry.status === "rejected").length;
  const returned = sourceRecords.filter((entry) => entry.status === "returned").length;

  return {
    sourceRecords,
    totalSubmitted,
    verified,
    pending,
    rejected,
    returned,
    eligibility: totalSubmitted === 0 ? "no_records" : verified === totalSubmitted ? "ready_for_review" : "incomplete",
  };
}

export function canDecideMonthlyTimesheet(role, status, note) {
  return role === "boss" && status === "submitted" && typeof note === "string" && note.trim().length >= 3;
}
