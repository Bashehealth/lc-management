"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { programmeStates } from "@/lib/programme-states.mjs";

type Row = Record<string, unknown>;
type StateRow = { id: string | null; code: string; name: string; configured: boolean; state_coordinators?: string[]; lga_count?: number; plan_count?: number; completed_task_count?: number; pending_review_count?: number; submitted_lga_report_count?: number; working_day_record_count?: number; leave_request_count?: number };
type LgaRow = { id: string; lga_id?: string; state_id: string; name: string; coordinator_reference_name?: string | null; lga_coordinators?: string[]; plan_count?: number; completed_task_count?: number; pending_review_count?: number; submitted_lga_report_count?: number; working_day_record_count?: number; leave_request_count?: number };
type Decision = "approved" | "rejected";
type Section = "DPM Dashboard" | "Working Days Monitor" | "Leave Requests";

const workingDayColumns = [
  ["lga_id", "LGA"], ["working_date", "Working date"], ["status", "Status"],
  ["submitted_by", "Submitted by"], ["submitted_at", "Submitted at"],
  ["approved_by", "Approved by"], ["approved_at", "Approved at"], ["authorization_note", "Note"],
] as const;

function display(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RecordsTable({ rows, columns }: { rows: Row[]; columns: readonly (readonly [string, string])[] }) {
  if (!rows.length) return <p className="dpm-empty">No records found.</p>;

  return (
    <div className="dpm-table-wrap">
      <table className="dpm-table">
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={String(row.id ?? index)}>{columns.map(([key]) => (
            <td key={key}>{key === "status" || key === "decision"
              ? <span className={`dpm-status dpm-status-${String(row[key] ?? "unknown")}`}>{display(row[key])}</span>
              : display(row[key])}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function DpmWorkspace({ section }: { section: Section }) {
  const [days, setDays] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [states, setStates] = useState<StateRow[]>([]);
  const [lgas, setLgas] = useState<LgaRow[]>([]);
  const [stateLgaSummaries, setStateLgaSummaries] = useState<LgaRow[]>([]);
  const [lgaSummaryUnavailable, setLgaSummaryUnavailable] = useState(false);
  const [workingDayCounts, setWorkingDayCounts] = useState<Record<string, number>>({});
  const [selectedState, setSelectedState] = useState<StateRow | null>(null);
  const [selectedLga, setSelectedLga] = useState<LgaRow | null>(null);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const [stateResult, lgaResult, dayResult, requestResult, historyResult, summaryResult] = await Promise.all([
      supabase.from("states").select("id,code,name").eq("is_active", true).order("name"),
      supabase.from("lgas").select("id,state_id,name,coordinator_reference_name").order("name"),
      supabase.from("working_day_records").select("id,lga_id,working_date,status,submitted_by,submitted_at,approved_by,approved_at,authorization_note").order("submitted_at", { ascending: false }).limit(200),
      supabase.from("leave_requests").select("id,requester_id,leave_type,start_date,end_date,reason,status,decision_note,reviewed_at,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("leave_request_decisions").select("id,request_id,decision,decision_note,reviewed_at").order("reviewed_at", { ascending: false }).limit(200),
      supabase.rpc("dpm_state_overview"),
    ]);

    const failures = [stateResult.error, lgaResult.error, dayResult.error, requestResult.error, historyResult.error].filter(Boolean);
    if (failures.length) {
      setError(failures.map((failure) => failure?.message).join(" · "));
    } else {
      const loadedStates = (stateResult.data ?? []) as (Omit<StateRow, "configured"> & { configured?: boolean })[];
      const loadedLgas = (lgaResult.data ?? []) as LgaRow[];
      const summaries = (summaryResult.data ?? []) as (StateRow & { state_id: string; state_code: string; state_name: string })[];
      const statesWithSummary = programmeStates.map((entry) => {
        const state = loadedStates.find((item) => item.code === entry.code);
        const summary = state && summaries.find((item) => item.state_id === state.id);
        return {
          ...entry,
          id: state?.id ?? null,
          configured: Boolean(state),
          ...(summary ? { ...summary, id: state?.id ?? null, code: entry.code, name: entry.name, configured: true } : {}),
        } as StateRow;
      });
      setDays((dayResult.data ?? []) as Row[]);
      setRequests((requestResult.data ?? []) as Row[]);
      setHistory((historyResult.data ?? []) as Row[]);
      setStates(statesWithSummary);
      setLgas(loadedLgas);
      setSummaryUnavailable(Boolean(summaryResult.error));

      const counts = summaryResult.error ? await Promise.all(loadedStates.filter((state): state is typeof state & { id: string } => Boolean(state.id)).map(async (state) => {
        const stateLgaIds = loadedLgas.filter((lga) => lga.state_id === state.id).map((lga) => lga.id);
        if (!stateLgaIds.length) return [state.id, 0] as const;
        const { count, error: countError } = await supabase.from("working_day_records")
          .select("id", { count: "exact", head: true }).in("lga_id", stateLgaIds);
        return [state.id, countError ? null : count ?? 0] as const;
      })) : [];
      setWorkingDayCounts(Object.fromEntries(counts.filter((entry): entry is readonly [string, number] => entry[1] !== null)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void loadData(); }, 0); return () => window.clearTimeout(timer); }, [loadData]);

  useEffect(() => {
    if (!selectedState?.id) {
      return;
    }
    let mounted = true;
    const supabase = createClient();
    void supabase.rpc("dpm_state_lga_overview", { p_state_id: selectedState.id }).then(({ data, error: summaryError }) => {
      if (!mounted) return;
      setLgaSummaryUnavailable(Boolean(summaryError));
      setStateLgaSummaries((data ?? []) as LgaRow[]);
    });
    return () => { mounted = false; };
  }, [selectedState]);

  async function decide(decision: Decision) {
    if (!selected || note.trim().length < 3) {
      setError("Enter a decision note of at least 3 characters.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { error: reviewError } = await supabase.rpc("review_leave_request", {
      p_request_id: String(selected.id), p_decision: decision, p_note: note.trim(),
    });
    if (reviewError) {
      setError(reviewError.message);
    } else {
      setMessage(`Leave request ${decision}. Decision recorded.`);
      setSelected(null);
      setNote("");
      await loadData();
    }
    setSaving(false);
  }

  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests.filter((request) => request.status !== "pending");
  const selectedStateLgas = lgas.filter((lga) => lga.state_id === selectedState?.id).map((lga) => {
    const summary = stateLgaSummaries.find((item) => item.lga_id === lga.id);
    return summary ? { ...lga, ...summary, id: lga.id, state_id: lga.state_id, name: lga.name } : lga;
  });
  const stateTotal = (field: keyof StateRow) => states.reduce((sum, state) => sum + (typeof state[field] === "number" ? state[field] as number : 0), 0);
  const configuredStates = states.filter((state) => state.configured);
  const fallbackWorkingDayTotal = configuredStates.length > 0 && configuredStates.every((state) => state.id && workingDayCounts[state.id] !== undefined)
    ? Object.values(workingDayCounts).reduce((sum, count) => sum + count, 0)
    : configuredStates.length === 0 ? 0 : null;

  return (
    <section className="dpm-workspace">
      <header className="dpm-heading">
        <div><span className="eyebrow">PROGRAMME OVERSIGHT · CROSS-LGA</span><h2>{section}</h2>
          <p>Monitor authorized programme records across the states configured in this system.</p></div>
        <button type="button" className="secondary-button" onClick={() => void loadData()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh data"}
        </button>
      </header>

      {error && <div className="dpm-message dpm-message-error" role="alert">{error}</div>}
      {message && <div className="dpm-message dpm-message-success" role="status">{message}</div>}
      {loading ? <div className="plan-empty"><strong>Loading DPM workspace…</strong></div> : <>
        {section === "DPM Dashboard" && <>
          <div className="dpm-metrics">
            <article className="plan-summary-card"><span>Programme states</span><strong>{states.length}</strong><small>{configuredStates.length} configured in database</small></article>
            <article className="plan-summary-card"><span>Working-day records</span><strong>{summaryUnavailable ? fallbackWorkingDayTotal ?? "—" : stateTotal("working_day_record_count")}</strong>
              {summaryUnavailable && <small>Exact total from permitted records</small>}</article>
            <article className="plan-summary-card"><span>Plans</span><strong>{summaryUnavailable ? "—" : stateTotal("plan_count")}</strong>
              {summaryUnavailable && <small>DPM reporting contract required</small>}</article>
            <article className="plan-summary-card"><span>Submitted LGA reports</span><strong>{summaryUnavailable ? "—" : stateTotal("submitted_lga_report_count")}</strong>
              {summaryUnavailable && <small>DPM reporting contract required</small>}</article>
            <article className="plan-summary-card"><span>Leave requests</span><strong>{summaryUnavailable ? requests.length : stateTotal("leave_request_count")}</strong><small>{summaryUnavailable ? "Latest 200 records" : "Across configured states"}</small></article>
            <article className="plan-summary-card"><span>Pending decisions</span><strong>{pending.length}</strong></article>
            <article className="plan-summary-card"><span>Recent decisions</span><strong>{history.length}</strong><small>Latest 200 records</small></article>
          </div>
          <article className="panel dpm-panel">
            <div className="panel-heading"><div><h3>All-state overview</h3><p>State list and working-day totals come from authorized database records.</p></div>
              {selectedState && <button type="button" className="secondary-button" onClick={() => { setSelectedState(null); setSelectedLga(null); }}>Back to all states</button>}</div>
            {!states.length ? <p className="dpm-empty">No active states are configured in the database.</p> : <>
              {!selectedState ? <div className="dpm-state-grid">{states.map((state) => <button type="button" className="dpm-state-card" key={state.code}
                onClick={() => { setSelectedState(state); setSelectedLga(null); }}>
                <span>{state.configured ? "Configured" : "Directory entry · setup required"}</span><strong>{state.name}</strong><small>{state.configured ? `${lgas.filter((lga) => lga.state_id === state.id).length} configured LGAs · ${state.working_day_record_count ?? (state.id ? workingDayCounts[state.id] : undefined) ?? "—"} working-day records` : "No state database record or operational figures yet."}</small>
              </button>)}</div> : <>
                <div className="dpm-selected-state"><span>{selectedState.configured ? "Selected state" : "Not yet configured in database"}</span><strong>{selectedState.name}</strong><small>{selectedState.configured ? `${lgas.filter((lga) => lga.state_id === selectedState.id).length} configured LGAs · ${selectedState.working_day_record_count ?? (selectedState.id ? workingDayCounts[selectedState.id] : undefined) ?? "—"} working-day records` : "This programme state is selectable, but its database record and operational assignments are not yet configured."}</small></div>
                {selectedState.configured && !summaryUnavailable && <div className="dpm-snapshot"><div><strong>{selectedState.state_coordinators?.join(", ") || "No coordinator profile"}</strong><span>State Coordinator</span></div>
                  <div><strong>{selectedState.plan_count ?? 0}</strong><span>Plans</span></div><div><strong>{selectedState.completed_task_count ?? 0}</strong><span>Completed tasks</span></div>
                  <div><strong>{selectedState.pending_review_count ?? 0}</strong><span>Pending reviews</span></div><div><strong>{selectedState.submitted_lga_report_count ?? 0}</strong><span>Submitted LGA reports</span></div>
                  <div><strong>{selectedState.leave_request_count ?? 0}</strong><span>Leave requests</span></div></div>}
                {selectedState.configured ? selectedLga ? <>
                  <div className="dpm-drilldown-actions"><button type="button" className="secondary-button" onClick={() => setSelectedLga(null)}>Back to {selectedState.name} LGAs</button>
                    <h4>{selectedLga.name} · LGA operations</h4></div>
                  <div className="panel-heading"><div><h3>Working-day records</h3><p>Read-only · newest 200 records visible for this LGA.</p></div></div>
                  <RecordsTable rows={days.filter((day) => day.lga_id === selectedLga.id)} columns={workingDayColumns.filter(([key]) => key !== "lga_id")} />
                  {(summaryUnavailable || lgaSummaryUnavailable) && <p className="dpm-boundary-note">Plan, task, report, leave-by-LGA and staff-profile summaries require an authorized DPM reporting contract that is not currently available in this database.</p>}
                </> : <>
                  {summaryUnavailable && <p className="dpm-boundary-note">State Coordinator names and operational totals are restricted by the current database policy. Apply the reviewed DPM reporting contract before these details can be shown.</p>}
                  <div className="dpm-lga-grid">{selectedStateLgas.map((lga) => <button type="button" className="dpm-lga-card" key={lga.id}
                    onClick={() => setSelectedLga(lga)}>
                    <strong>{lga.name}</strong><span>{lga.working_day_record_count ?? days.filter((day) => day.lga_id === lga.id).length} working-day records</span>
                    {!summaryUnavailable && !lgaSummaryUnavailable && <small>LC: {lga.lga_coordinators?.join(", ") || "No coordinator profile"} · {lga.completed_task_count ?? 0} completed tasks</small>}
                    {lga.coordinator_reference_name && <small>Coordinator reference: {lga.coordinator_reference_name}</small>}
                  </button>)}</div>
                </> : <p className="dpm-boundary-note">No operational records, LGA assignments or coordinator profiles are available for this state yet.</p>}
              </>}
            </>}
          </article>
          <article className="panel dpm-panel"><h3>Oversight snapshot</h3>
            <p>Working-day monitoring is read-only. Leave decisions require a note and are recorded in the decision history.</p>
            <div className="dpm-snapshot"><div><strong>{days.filter((day) => day.status === "claimed").length}</strong><span>Awaiting working-day review · latest 200</span></div>
              <div><strong>{pending.length}</strong><span>Leave requests awaiting a decision · latest 200</span></div>
              <div><strong>{days.filter((day) => day.status === "approved").length}</strong><span>Approved working days · latest 200</span></div></div>
          </article>
        </>}

        {section === "Working Days Monitor" && <article className="panel dpm-panel">
          <div className="panel-heading"><div><h3>Working-day register</h3><p>{days.length} latest submissions · read-only access</p></div></div>
          <RecordsTable rows={days} columns={workingDayColumns} />
        </article>}

        {section === "Leave Requests" && <>
          <article className="panel dpm-panel"><div className="panel-heading"><div><h3>Awaiting decision <span className="dpm-count">{pending.length}</span></h3>
            <p>Review the request and record a reason with each decision.</p></div></div>
            {!pending.length ? <p className="dpm-empty">No leave requests are awaiting review.</p> : pending.map((request) => (
              <div className="dpm-request" key={String(request.id)}><div><strong>{display(request.leave_type)} leave</strong>
                <span>{display(request.start_date)} – {display(request.end_date)}</span><p>{display(request.reason)}</p>
                <small>Submitted {display(request.created_at)}</small></div>
                <button type="button" className="primary-button" onClick={() => { setSelected(request); setNote(""); setError(""); }}>Review request</button>
              </div>))}
          </article>

          {selected && <article className="panel dpm-panel dpm-review"><div className="panel-heading"><div><h3>Record leave decision</h3><p>Request {String(selected.id)}</p></div></div>
            <dl className="dpm-request-details"><div><dt>Leave type</dt><dd>{display(selected.leave_type)}</dd></div>
              <div><dt>Dates</dt><dd>{display(selected.start_date)} – {display(selected.end_date)}</dd></div>
              <div><dt>Reason</dt><dd>{display(selected.reason)}</dd></div></dl>
            <label htmlFor="dpm-decision-note">Decision note <span>(required)</span></label>
            <textarea id="dpm-decision-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} minLength={3}
              placeholder="Explain the reason for your decision…" />
            <div className="dpm-actions">
              <button type="button" className="primary-button" disabled={saving || note.trim().length < 3} onClick={() => void decide("approved")}>{saving ? "Saving…" : "Approve request"}</button>
              <button type="button" className="secondary-button" disabled={saving || note.trim().length < 3} onClick={() => void decide("rejected")}>Reject request</button>
              <button type="button" className="dpm-cancel" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
            </div>
          </article>}

          <article className="panel dpm-panel"><div className="panel-heading"><div><h3>Decision history</h3><p>Append-only audit of recorded decisions</p></div></div>
            <RecordsTable rows={history} columns={[["request_id", "Request"], ["decision", "Decision"], ["decision_note", "Decision note"], ["reviewed_at", "Reviewed at"]]} />
          </article>
          <article className="panel dpm-panel"><div className="panel-heading"><div><h3>Reviewed requests</h3><p>Completed leave request outcomes</p></div></div>
            <RecordsTable rows={decided} columns={[["leave_type", "Leave type"], ["start_date", "From"], ["end_date", "To"], ["status", "Outcome"], ["decision_note", "Decision note"], ["reviewed_at", "Reviewed at"]]} />
          </article>
        </>}
      </>}
    </section>
  );
}
