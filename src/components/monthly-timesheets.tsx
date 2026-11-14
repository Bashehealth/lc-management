"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { programmeStates } from "@/lib/programme-states.mjs";
import { canDecideMonthlyTimesheet, summarizeWorkingDayEntries } from "@/lib/monthly-timesheet.mjs";

type View = "dpm" | "boss";
type WorkingDayEntry = { id: string; working_date: string; status: "claimed" | "approved" | "returned" | "rejected"; submitted_at?: string; approved_by?: string | null; approved_at?: string | null };
type PreviewLine = {
  state_id: string; state_code: string; state_name: string; lga_id: string; lga_name: string;
  lc_id: string; lc_name: string; total_submitted_days: number; verified_days: number;
  pending_review_records: number; rejected_records: number; returned_records: number;
  eligibility_status: string; source_records: WorkingDayEntry[]; source_fingerprint: string;
};
type TimesheetRow = {
  timesheet_id: string; reporting_month: string; version_number: number; status: string;
  prepared_by_name: string; submitted_by_name?: string; submitted_at: string | null;
  reviewed_by_name?: string | null; reviewed_at?: string | null; decision_note?: string | null;
  event_history?: { action: string; actor_id: string; note: string | null; occurred_at: string }[];
};
type TimesheetDetails = {
  timesheet?: TimesheetRow & { prepared_by_name: string; submitted_by_name: string; reviewed_by_name: string; state_directory_snapshot?: { state_id: string; code: string; name: string; lga_count: number; assigned_lc_count: number }[] };
  lines?: { id: string; state_name_snapshot: string; lga_name_snapshot: string; lga_coordinator_name_snapshot: string; lga_coordinator_id: string; total_submitted_days: number; verified_days: number; pending_review_records: number; rejected_records: number; returned_records: number; eligibility_status: string }[];
  sources?: { id: string; working_day_record_id: string; state_id: string; lga_id: string; submitted_by: string; submitter_name_snapshot: string; working_date: string; status_snapshot: WorkingDayEntry["status"]; approved_at_snapshot: string | null; issue_code: string | null; line_id: string | null }[];
  events?: { action: string; actor_id: string; actor_name: string; note: string | null; occurred_at: string }[];
};

const display = (value: unknown) => value == null || value === "" ? "—" : String(value);
const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };
const formatMonth = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function MonthlyTimesheets({ view }: { view: View }) {
  const [month, setMonth] = useState(currentMonth);
  const [directoryCodes, setDirectoryCodes] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewLine[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [details, setDetails] = useState<TimesheetDetails | null>(null);
  const [selectedState, setSelectedState] = useState("all");
  const [selectedLga, setSelectedLga] = useState("all");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDirectory = useCallback(async () => {
    const db = createClient();
    const { data, error: directoryError } = await db.from("states").select("code").eq("is_active", true);
    if (directoryError) setError(directoryError.message);
    else setDirectoryCodes(new Set((data ?? []).map((state) => state.code)));
  }, []);

  const loadDpmHistory = useCallback(async () => {
    const { data, error: listError } = await createClient().rpc("dpm_monthly_timesheet_list");
    if (listError) setError("Monthly timesheet database contract is not enabled. Review and apply the proposed timesheet SQL before using this workflow.");
    else setRows((data ?? []) as TimesheetRow[]);
  }, []);

  const loadBossQueue = useCallback(async () => {
    const { data, error: listError } = await createClient().rpc("boss_monthly_timesheet_list");
    if (listError) setError("Boss timesheet approval is unavailable until the reviewed timesheet database contract is installed.");
    else setRows((data ?? []) as TimesheetRow[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void Promise.all([loadDirectory(), view === "dpm" ? loadDpmHistory() : loadBossQueue()]).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDirectory, loadDpmHistory, loadBossQueue, view]);

  async function loadPreview() {
    setLoading(true); setError(""); setMessage(""); setPreview([]);
    setPreviewLoaded(false);
    const { data, error: previewError } = await createClient().rpc("dpm_monthly_timesheet_preview", { p_month: `${month}-01` });
    if (previewError) setError("The DPM monthly timesheet contract is not installed. See the unapplied SQL proposal before attempting a live submission.");
    else { setPreview((data ?? []) as PreviewLine[]); setPreviewLoaded(true); }
    setLoading(false);
  }

  const visibleLines = useMemo(() => preview.filter((line) =>
    (selectedState === "all" || line.state_code === selectedState) &&
    (selectedLga === "all" || line.lga_id === selectedLga)), [preview, selectedState, selectedLga]);
  const lgaOptions = useMemo(() => [...new Map(preview.filter((line) => selectedState === "all" || line.state_code === selectedState)
    .map((line) => [line.lga_id, { id: line.lga_id, name: line.lga_name }])).values()], [preview, selectedState]);
  const summary = useMemo(() => visibleLines.reduce((totals, line) => {
    const records = summarizeWorkingDayEntries(line.source_records, month);
    return { lcs: totals.lcs + 1, submitted: totals.submitted + records.totalSubmitted, verified: totals.verified + records.verified,
      pending: totals.pending + records.pending, rejected: totals.rejected + records.rejected };
  }, { lcs: 0, submitted: 0, verified: 0, pending: 0, rejected: 0 }), [visibleLines, month]);

  async function submitSnapshot() {
    const fingerprint = preview[0]?.source_fingerprint;
    if (!fingerprint || !preview.length) {
      setError("Load a complete preview with assigned LC rows before submitting.");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    const { data, error: submitError } = await createClient().rpc("dpm_submit_monthly_timesheet", {
      p_month: `${month}-01`, p_expected_fingerprint: fingerprint,
    });
    if (submitError) setError(submitError.message);
    else {
      setMessage(`Timesheet snapshot ${String(data)} was submitted to Boss. The submitted source records are now fixed for this version.`);
      setPreview([]);
      await loadDpmHistory();
    }
    setSaving(false);
  }

  async function inspectTimesheet(timesheetId: string) {
    setDetails(null); setNote(""); setError("");
    const { data, error: detailError } = await createClient().rpc("boss_monthly_timesheet_details", { p_timesheet_id: timesheetId });
    if (detailError) setError(detailError.message);
    else setDetails(data as TimesheetDetails);
  }

  async function decide(decision: "approved" | "rejected") {
    if (!details?.timesheet || note.trim().length < 3) return;
    setSaving(true); setError(""); setMessage("");
    const { error: decisionError } = await createClient().rpc("boss_decide_monthly_timesheet", {
      p_timesheet_id: details.timesheet.timesheet_id,
      p_decision: decision,
      p_note: note.trim(),
    });
    if (decisionError) setError(decisionError.message);
    else {
      setMessage(`Timesheet ${decision}. Decision recorded in history. This does not represent payment.`);
      await loadBossQueue();
      await inspectTimesheet(details.timesheet.timesheet_id);
    }
    setSaving(false);
  }

  if (view === "dpm") {
    return <section className="timesheet-workspace">
      <header className="dpm-heading"><div><span className="eyebrow">DPM · MONTHLY OPERATIONS</span><h2>Monthly LC Timesheet</h2>
        <p>Review state, LGA and LC source records. Only approved days count as verified; no payment rate is applied.</p></div></header>
      {error && <div className="dpm-message dpm-message-error" role="alert">{error}</div>}
      {message && <div className="dpm-message dpm-message-success" role="status">{message}</div>}
      <article className="panel timesheet-panel">
        <div className="timesheet-controls"><label htmlFor="dpm-timesheet-month">Reporting month<input id="dpm-timesheet-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPreview([]); }} /></label>
          <button className="primary-button" type="button" onClick={() => void loadPreview()} disabled={loading}>{loading ? "Loading…" : "Load monthly preview"}</button></div>
        <div className="timesheet-state-grid"><button type="button" className={`timesheet-state-filter ${selectedState === "all" ? "selected" : ""}`} onClick={() => { setSelectedState("all"); setSelectedLga("all"); }}>All states</button>
          {programmeStates.map((state) => <button type="button" key={state.code} className={`timesheet-state-filter ${selectedState === state.code ? "selected" : ""}`} onClick={() => { setSelectedState(state.code); setSelectedLga("all"); }}>
            <strong>{state.name}</strong><small>{directoryCodes.has(state.code) ? "Configured" : "Not configured in database"}</small>
          </button>)}
        </div>
        {preview.length > 0 && <>
          <div className="dpm-metrics"><article className="plan-summary-card"><span>LCs in view</span><strong>{summary.lcs}</strong></article>
            <article className="plan-summary-card"><span>Submitted days</span><strong>{summary.submitted}</strong></article>
            <article className="plan-summary-card"><span>Verified approved days</span><strong>{summary.verified}</strong></article>
            <article className="plan-summary-card"><span>Pending records</span><strong>{summary.pending}</strong></article>
            <article className="plan-summary-card"><span>Rejected records</span><strong>{summary.rejected}</strong></article></div>
          <div className="timesheet-controls"><label htmlFor="timesheet-lga-filter">LGA<select id="timesheet-lga-filter" value={selectedLga} onChange={(event) => setSelectedLga(event.target.value)}><option value="all">All LGAs</option>{lgaOptions.map((lga) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}</select></label>
            <span>{formatMonth(month)} · {visibleLines.length} assigned LC rows</span></div>
          <div className="dpm-table-wrap"><table className="dpm-table timesheet-table"><thead><tr><th>State</th><th>LGA</th><th>LC / identifier</th><th>Submitted</th><th>Verified</th><th>Pending</th><th>Rejected</th><th>Returned</th><th>Eligibility status</th><th>Source entries</th></tr></thead>
            <tbody>{visibleLines.map((line) => { const totals = summarizeWorkingDayEntries(line.source_records, month); return <tr key={`${line.lga_id}-${line.lc_id}`}>
              <td>{line.state_name}</td><td>{line.lga_name}</td><td>{line.lc_name}<small>{line.lc_id}</small></td>
              <td>{totals.totalSubmitted}</td><td>{totals.verified}</td><td>{totals.pending}</td><td>{totals.rejected}</td><td>{totals.returned}</td>
              <td><span className={`dpm-status dpm-status-${totals.eligibility}`}>{totals.eligibility.replaceAll("_", " ")}</span></td>
              <td><details><summary>{totals.sourceRecords.length} records</summary><ul>{totals.sourceRecords.map((record) => <li key={record.id}>{record.working_date} · {record.status} · ref {record.id}</li>)}</ul></details></td>
            </tr>; })}</tbody></table></div>
          {!visibleLines.length && <p className="dpm-empty">No assigned LC rows match this selection.</p>}
          <p className="timesheet-note">Preview data is live until submission. The submit operation rechecks its source fingerprint and stores a versioned immutable snapshot. Pending, returned and rejected entries are excluded from verified totals.</p>
          <button className="primary-button" type="button" onClick={() => void submitSnapshot()} disabled={saving || !preview.length || selectedState !== "all" || selectedLga !== "all"}>
            {saving ? "Submitting…" : "Submit complete monthly snapshot to Boss"}
          </button>
          {(selectedState !== "all" || selectedLga !== "all") && <p className="timesheet-note">Clear the state and LGA filters to review and submit the complete statewide snapshot.</p>}
        </>}
        {!preview.length && !loading && !error && <p className="dpm-empty">{previewLoaded ? "No assigned LC rows or working-day records were found for this month. The state directory remains visible above; no totals have been fabricated." : "Choose a month and load the database preview. States with no current operational setup remain visible and are not assigned fabricated totals."}</p>}
      </article>
      <article className="panel timesheet-panel"><div className="panel-heading"><div><h3>Submitted timesheet history</h3><p>Snapshots and decisions remain versioned and traceable.</p></div><button type="button" className="secondary-button" onClick={() => void loadDpmHistory()}>Refresh history</button></div>
        {!rows.length ? <p className="dpm-empty">No timesheet snapshots are available.</p> : <div className="dpm-table-wrap"><table className="dpm-table"><thead><tr><th>Month</th><th>Version</th><th>Prepared by</th><th>Status</th><th>Submitted</th><th>Decision history</th></tr></thead><tbody>{rows.map((row) => <tr key={row.timesheet_id}><td>{formatMonth(row.reporting_month.slice(0, 7))}</td><td>{row.version_number}</td><td>{row.prepared_by_name}</td><td>{row.status}</td><td>{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}</td><td>{(row.event_history ?? []).map((event) => `${event.action} · ${new Date(event.occurred_at).toLocaleString()}${event.note ? ` · ${event.note}` : ""}`).join("; ") || "—"}</td></tr>)}</tbody></table></div>}
      </article>
    </section>;
  }

  return <section className="timesheet-workspace">
    <header className="dpm-heading"><div><span className="eyebrow">BOSS · FINAL TIMESHEET REVIEW</span><h2>Timesheet Approvals</h2><p>Inspect immutable monthly snapshots and source records. Approval does not indicate payment.</p></div>
      <button type="button" className="secondary-button" onClick={() => void loadBossQueue()} disabled={loading}>Refresh queue</button></header>
    {error && <div className="dpm-message dpm-message-error" role="alert">{error}</div>}
    {message && <div className="dpm-message dpm-message-success" role="status">{message}</div>}
    <article className="panel timesheet-panel"><div className="panel-heading"><div><h3>Submitted timesheets</h3><p>Preparer, submission and decision history are recorded.</p></div></div>
      {!rows.length ? <p className="dpm-empty">No submitted monthly timesheets are available.</p> : <div className="dpm-table-wrap"><table className="dpm-table"><thead><tr><th>Month</th><th>Version</th><th>Prepared by</th><th>Submitted by</th><th>Submitted at</th><th>Status</th><th>Decision</th><th>Review</th></tr></thead><tbody>{rows.map((row) => <tr key={row.timesheet_id}><td>{formatMonth(row.reporting_month.slice(0, 7))}</td><td>{row.version_number}</td><td>{row.prepared_by_name}</td><td>{display(row.submitted_by_name)}</td><td>{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}</td><td>{row.status}</td><td>{display(row.decision_note)}</td><td><button className="secondary-button" type="button" onClick={() => void inspectTimesheet(row.timesheet_id)}>Inspect</button></td></tr>)}</tbody></table></div>}
    </article>
    {details?.timesheet && <article className="panel timesheet-panel"><div className="panel-heading"><div><h3>{formatMonth(details.timesheet.reporting_month.slice(0, 7))} · version {details.timesheet.version_number}</h3><p>Prepared by {details.timesheet.prepared_by_name} · submitted by {details.timesheet.submitted_by_name} · {display(details.timesheet.submitted_at)}</p></div><span className={`dpm-status dpm-status-${details.timesheet.status}`}>{details.timesheet.status}</span></div>
      <details className="timesheet-sources"><summary>Programme state coverage snapshot ({details.timesheet.state_directory_snapshot?.length ?? 0} states)</summary><ul>{(details.timesheet.state_directory_snapshot ?? []).map((state) => <li key={state.state_id}>{state.name} · {state.lga_count} LGAs · {state.assigned_lc_count} assigned LCs</li>)}</ul></details>
      <div className="dpm-table-wrap"><table className="dpm-table"><thead><tr><th>State</th><th>LGA</th><th>LC</th><th>LC identifier</th><th>Submitted</th><th>Verified</th><th>Pending</th><th>Rejected</th><th>Returned</th><th>Review status</th></tr></thead><tbody>{(details.lines ?? []).map((line) => <tr key={line.id}><td>{line.state_name_snapshot}</td><td>{line.lga_name_snapshot}</td><td>{line.lga_coordinator_name_snapshot}</td><td>{line.lga_coordinator_id}</td><td>{line.total_submitted_days}</td><td>{line.verified_days}</td><td>{line.pending_review_records}</td><td>{line.rejected_records}</td><td>{line.returned_records}</td><td>{line.eligibility_status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>
      <details className="timesheet-sources"><summary>Supporting working-day source entries ({details.sources?.length ?? 0})</summary><div className="dpm-table-wrap"><table className="dpm-table"><thead><tr><th>Record reference</th><th>State ID</th><th>LGA ID</th><th>Submitter</th><th>Date</th><th>Status snapshot</th><th>Approved at</th><th>Assignment check</th></tr></thead><tbody>{(details.sources ?? []).map((source) => <tr key={source.id}><td>{source.working_day_record_id}</td><td>{source.state_id}</td><td>{source.lga_id}</td><td>{source.submitter_name_snapshot} · {source.submitted_by}</td><td>{source.working_date}</td><td>{source.status_snapshot}</td><td>{display(source.approved_at_snapshot)}</td><td>{source.issue_code ?? "Assigned"}</td></tr>)}</tbody></table></div></details>
      <section className="timesheet-history"><h4>Submission and decision history</h4>{(details.events ?? []).map((event, index) => <p key={`${event.action}-${event.occurred_at}-${index}`}>{event.action} · {event.actor_name} · {new Date(event.occurred_at).toLocaleString()}{event.note ? ` · ${event.note}` : ""}</p>)}</section>
      {details.timesheet.status === "submitted" && <div className="timesheet-review"><label htmlFor="boss-timesheet-note">Decision note <span>(required)</span><textarea id="boss-timesheet-note" value={note} onChange={(event) => setNote(event.target.value)} minLength={3} rows={4} placeholder="Explain the approval or rejection decision…" /></label>
        <div className="dpm-actions"><button type="button" className="primary-button" disabled={saving || !canDecideMonthlyTimesheet(view, details.timesheet.status, note)} onClick={() => void decide("approved")}>Approve timesheet</button><button type="button" className="secondary-button" disabled={saving || !canDecideMonthlyTimesheet(view, details.timesheet.status, note)} onClick={() => void decide("rejected")}>Reject timesheet</button></div></div>}
      <p className="timesheet-note">Approval records a decision only. It does not authorize or confirm payment.</p>
    </article>}
  </section>;
}
