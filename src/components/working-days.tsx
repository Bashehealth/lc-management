"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RecordRow = {
  id: string;
  working_date: string;
  claim_note: string | null;
  status: "claimed" | "approved" | "returned" | "rejected";
  submitted_at: string;
  approved_at: string | null;
  authorization_note: string | null;
  latest_approval_event_id: string | null;
};
type HistoryRow = { id: string; working_day_record_id: string; action: string; note: string | null; acted_at: string; acted_by: string };

const statusLabel: Record<RecordRow["status"], string> = {
  claimed: "Pending review", approved: "Approved", returned: "Returned", rejected: "Rejected",
};

export default function WorkingDays({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [allocation, setAllocation] = useState(15);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!lgaId) {
      setError("Your account is not linked to an LGA. Contact the system administrator.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const start = `${month}-01`;
      const endDate = new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0
      ).getDate();
      const end = `${month}-${String(endDate).padStart(2, "0")}`;

      const [recordResult, policyResult] = await Promise.all([
        supabase
          .from("working_day_records")
          .select("id, working_date, claim_note, status, submitted_at, approved_at, authorization_note, latest_approval_event_id")
          .eq("lga_id", lgaId)
          .gte("working_date", start)
          .lte("working_date", end)
          .order("working_date", { ascending: false }),

        supabase
          .from("operational_policy_settings")
          .select("monthly_working_day_allocation")
          .lte("effective_from", start)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (recordResult.error) {
        throw new Error(`Working-day records: ${recordResult.error.message}`);
      }

      const rows = (recordResult.data || []) as RecordRow[];
      setRecords(rows);

      const ids = rows.map((record) => record.id);

      if (ids.length > 0) {
        const historyResult = await supabase
          .from("working_day_approvals")
          .select("id, working_day_record_id, action, note, acted_at, acted_by")
          .in("working_day_record_id", ids)
          .order("acted_at", { ascending: false });

        if (historyResult.error) {
          throw new Error(`Approval history: ${historyResult.error.message}`);
        }

        setHistory((historyResult.data || []) as HistoryRow[]);
      } else {
        setHistory([]);
      }

      if (policyResult.error) {
        throw new Error(`Working-day allocation: ${policyResult.error.message}`);
      }

      if (policyResult.data) {
        setAllocation(policyResult.data.monthly_working_day_allocation);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load working-day records.";
      setError(message);
      console.error("Working Days loading error:", err);
    } finally {
      setLoading(false);
    }
  }, [lgaId, month, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const approved = records.filter((r) => r.status === "approved").length;
  const pending = records.filter((r) => r.status === "claimed").length;
  const claimed = records.length;
  const remaining = Math.max(0, allocation - approved);
  const filtered = useMemo(() => records.filter((r) => filter === "All" || statusLabel[r.status] === filter), [records, filter]);

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lgaId || !date) return;
    setSaving(true); setError(""); setNotice("");
    const { error: insertError } = await supabase.from("working_day_records").insert({
      lga_id: lgaId, working_date: date, claim_note: note.trim() || null, status: "claimed", submitted_by: userId,
    });
    if (insertError) setError(insertError.message);
    else {
      setNotice("Working-day claim submitted and saved. It is pending supervisor review.");
      setDate(""); setNote(""); setShowForm(false);
      await load();
    }
    setSaving(false);
  }

  return (
    <div className="working-days-module">
      {(error || notice) && <div className="plans-notice" role="status"><span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
      <div className="working-days-heading"><div><span className="eyebrow">LGA COORDINATOR WORKSPACE</span><h2>Working Days</h2><p>Submit daily work claims and track supervisor decisions.</p></div><span className="live-label">LIVE DATABASE</span></div>
      <section className="working-allocation-panel"><div><span className="eyebrow">MONTHLY WORKING-DAY ALLOCATION</span><h3>{allocation} working days</h3><p>Only approved claims count against your allocation.</p></div><div className="allocation-month"><label htmlFor="working-month">Reporting month</label><input id="working-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div></section>
      <div className="working-summary-grid">
        {[{ label: "Monthly allocation", value: allocation, hint: "Authorized standard days" }, { label: "Claimed days", value: claimed, hint: "Submitted records" }, { label: "Approved days", value: approved, hint: "Supervisor verified" }, { label: "Remaining days", value: remaining, hint: "Based on approved days" }].map((item) => <article className="plan-summary-card" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.hint}</small></article>)}
      </div>
      <section className="working-usage-panel panel"><div className="panel-heading"><div><h3>Allocation usage</h3><p>{pending} claims are awaiting review.</p></div><strong>{approved} / {allocation}</strong></div><div className="plan-progress-track"><div className="plan-progress-fill" style={{ width: `${Math.min(100, allocation ? approved / allocation * 100 : 0)}%` }} /></div><div className="working-usage-legend"><span>{approved} approved</span><span>{pending} pending review</span><span>{remaining} remaining</span></div></section>
      <section className="panel working-records-panel"><div className="panel-heading working-records-heading"><div><h3>Daily working-day records</h3><p>One claim per date worked.</p></div><button className="primary-button" type="button" onClick={() => setShowForm(true)}>+ Submit working day</button></div>
        <div className="working-filter-row"><span className="working-record-count">{records.length} records for {month}</span><select className="plan-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option><option>Pending review</option><option>Approved</option><option>Returned</option><option>Rejected</option></select></div>
        {loading ? <div className="plan-empty">Loading working-day records…</div> : filtered.length === 0 ? <div className="plan-empty"><strong>No working-day records</strong><p>Submit a claim when you complete an operational working day.</p></div> : <div className="working-record-list">{filtered.map((record) => {
          const events = history.filter((h) => h.working_day_record_id === record.id);
          return <article className="working-record" key={record.id}><div className="working-record-date"><strong>{record.working_date}</strong><span>Submitted {new Date(record.submitted_at).toLocaleString()}</span></div><div className="working-record-note"><span>WORK NOTE</span><p>{record.claim_note || "No additional note provided."}</p></div><div className="working-record-status"><span className={`plan-status ${record.status === "approved" ? "plan-status-completed" : record.status === "claimed" ? "plan-status-ongoing" : "plan-status-returned"}`}>{statusLabel[record.status]}</span>{events.map((event) => <p key={event.id}>{event.action.toUpperCase()}: {event.note || "No comment"} · {new Date(event.acted_at).toLocaleString()}</p>)}</div></article>;
        })}</div>}
      </section>
      <section className="working-policy-note"><strong>Allocation and approval rules</strong><ul><li>Claims are saved against your assigned LGA and selected month.</li><li>Only supervisor-approved days count against the allocation.</li><li>Returned claims remain in the record and retain their review history.</li><li>Additional days require separate supervisor authorization.</li></ul></section>
      {showForm && <div className="plan-modal-backdrop"><section className="plan-modal"><div className="plan-modal-heading"><div><span className="eyebrow">DAILY ATTENDANCE RECORD</span><h2>Submit working day</h2></div><button className="plan-modal-close" type="button" onClick={() => setShowForm(false)}>×</button></div><form onSubmit={submitClaim}><label className="plan-form-field">Working date *<input type="date" required value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></label><label className="plan-form-field">Work note<textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Briefly describe the work performed." /></label><div className="plan-form-note">Your claim will be saved as pending review. It will not count as an approved working day until a supervisor reviews it.</div><div className="plan-form-actions"><button type="button" className="plan-cancel-button" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Submitting…" : "Submit claim"}</button></div></form></section></div>}
    </div>
  );
}
