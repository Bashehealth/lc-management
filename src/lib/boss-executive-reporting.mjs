export function mergeProgrammeStates(directory, databaseRows) {
  const byCode = new Map((databaseRows ?? []).map((row) => [row.state_code, row]));
  return directory.map((state) => {
    const row = byCode.get(state.code);
    return {
      ...state,
      state_id: row?.state_id ?? null,
      configured: Boolean(row),
      registered_lgas: row?.registered_lgas ?? null,
      active_lgas: row?.active_lgas ?? null,
      lga_coordinators: row?.lga_coordinators ?? null,
      state_coordinators: row?.state_coordinators ?? null,
      senior_supervisors: row?.senior_supervisors ?? null,
      verified_working_days: row?.verified_working_days ?? null,
      pending_working_days: row?.pending_working_days ?? null,
      returned_working_days: row?.returned_working_days ?? null,
      rejected_working_days: row?.rejected_working_days ?? null,
    };
  });
}

export function summarizeBossWorkingDays(rows) {
  return (rows ?? []).reduce((totals, row) => ({
    approved: totals.approved + Number(row.approved_days ?? 0),
    pending: totals.pending + Number(row.pending_days ?? 0),
    returned: totals.returned + Number(row.returned_days ?? 0),
    rejected: totals.rejected + Number(row.rejected_days ?? 0),
  }), { approved: 0, pending: 0, returned: 0, rejected: 0 });
}

export function filterBossPersonnel(rows, { stateCode = "all", lgaId = "all", role = "all", search = "" } = {}) {
  const query = search.trim().toLocaleLowerCase();
  return (rows ?? []).filter((person) =>
    (stateCode === "all" || person.state_code === stateCode) &&
    (lgaId === "all" || person.lga_id === lgaId) &&
    (role === "all" || person.role === role) &&
    (!query || person.full_name.toLocaleLowerCase().includes(query))
  );
}

export function contactLabel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "Not provided";
}
