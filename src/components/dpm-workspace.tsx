"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;
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
    const [dayResult, requestResult, historyResult] = await Promise.all([
      supabase.from("working_day_records").select("id,lga_id,working_date,status,submitted_by,submitted_at,approved_by,approved_at,authorization_note").order("submitted_at", { ascending: false }).limit(200),
      supabase.from("leave_requests").select("id,requester_id,leave_type,start_date,end_date,reason,status,decision_note,reviewed_at,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("leave_request_decisions").select("id,request_id,decision,decision_note,reviewed_at").order("reviewed_at", { ascending: false }).limit(200),
    ]);

    const failures = [dayResult.error, requestResult.error, historyResult.error].filter(Boolean);
    if (failures.length) {
      setError(failures.map((failure) => failure?.message).join(" · "));
    } else {
      setDays((dayResult.data ?? []) as Row[]);
      setRequests((requestResult.data ?? []) as Row[]);
      setHistory((historyResult.data ?? []) as Row[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void loadData(); }, 0); return () => window.clearTimeout(timer); }, [loadData]);

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

  return (
    <section className="dpm-workspace">
      <header className="dpm-heading">
        <div><span className="eyebrow">PROGRAMME OVERSIGHT · CROSS-LGA</span><h2>{section}</h2>
          <p>Monitor submitted working days and make recorded leave decisions.</p></div>
        <button type="button" className="secondary-button" onClick={() => void loadData()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh data"}
        </button>
      </header>

      {error && <div className="dpm-message dpm-message-error" role="alert">{error}</div>}
      {message && <div className="dpm-message dpm-message-success" role="status">{message}</div>}
      {loading ? <div className="plan-empty"><strong>Loading DPM workspace…</strong></div> : <>
        {section === "DPM Dashboard" && <>
          <div className="dpm-metrics">
            <article className="plan-summary-card"><span>Working-day records</span><strong>{days.length}</strong></article>
            <article className="plan-summary-card"><span>Leave requests</span><strong>{requests.length}</strong></article>
            <article className="plan-summary-card"><span>Pending decisions</span><strong>{pending.length}</strong></article>
            <article className="plan-summary-card"><span>Completed decisions</span><strong>{history.length}</strong></article>
          </div>
          <article className="panel dpm-panel"><h3>Oversight snapshot</h3>
            <p>Working-day monitoring is read-only. Leave decisions require a note and are recorded in the decision history.</p>
            <div className="dpm-snapshot"><div><strong>{days.filter((day) => day.status === "claimed").length}</strong><span>Awaiting working-day review</span></div>
              <div><strong>{pending.length}</strong><span>Leave requests awaiting a decision</span></div>
              <div><strong>{days.filter((day) => day.status === "approved").length}</strong><span>Approved working days</span></div></div>
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
