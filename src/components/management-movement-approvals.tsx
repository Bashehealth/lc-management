"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canManagementDecide, hasRequiredDecisionNote, managementDecisionStatuses } from "@/lib/movement-workflow.mjs";

type Request = {
  id: string;
  lga_id: string;
  requested_by: string;
  destination: string;
  reason: string;
  departure_at: string;
  expected_return_at: string;
  status: "pending_management" | "approved" | "rejected";
  created_at: string;
  state_recommendation: string | null;
  management_decision_note: string | null;
  management_decided_at: string | null;
};

type History = { id: string; movement_request_id: string; actor_role: string; action: string; decision_note: string | null; occurred_at: string };

export default function ManagementMovementApprovals({ historyOnly = false, userId }: { historyOnly?: boolean; userId: string }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState(historyOnly ? "decided" : "pending_management");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const db = createClient();
    const [requestsResult, historyResult, lgasResult] = await Promise.all([
      db.from("movement_requests").select("id,lga_id,requested_by,destination,reason,departure_at,expected_return_at,status,created_at,state_recommendation,management_decision_note,management_decided_at").in("status", managementDecisionStatuses).order("created_at", { ascending: false }),
      db.from("movement_request_history").select("id,movement_request_id,actor_role,action,decision_note,occurred_at").order("occurred_at", { ascending: true }),
      db.from("lgas").select("id,name"),
    ]);
    const failure = requestsResult.error ?? historyResult.error ?? lgasResult.error;
    if (failure) setError(failure.message);
    else {
      setRequests((requestsResult.data ?? []) as Request[]);
      setHistory((historyResult.data ?? []) as History[]);
      setNames(Object.fromEntries((lgasResult.data ?? []).map((row) => [row.id, row.name])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const visible = useMemo(() => requests.filter((request) => filter === "all" || (filter === "decided" ? request.status !== "pending_management" : request.status === filter)), [requests, filter]);
  const pending = requests.filter((request) => request.status === "pending_management").length;
  const approved = requests.filter((request) => request.status === "approved").length;
  const rejected = requests.filter((request) => request.status === "rejected").length;

  async function decide(request: Request, status: "approved" | "rejected") {
    const note = notes[request.id]?.trim() ?? "";
    if (!canManagementDecide(request.status)) { setError("This request is no longer awaiting Management. Refresh the list."); return; }
    if (!hasRequiredDecisionNote(note)) { setError("Enter a decision note of at least 3 characters."); return; }
    setSaving(request.id); setError(""); setNotice("");
    const { data, error: updateError } = await createClient().from("movement_requests").update({
      status,
      management_decided_by: userId,
      management_decided_at: new Date().toISOString(),
      management_decision_note: note,
    }).eq("id", request.id).eq("status", "pending_management").select("id").maybeSingle();
    if (updateError) setError(updateError.message);
    else if (!data) setError("This request was already decided or is no longer available. Refresh the list.");
    else { setNotice(status === "approved" ? "Final approval recorded." : "Final rejection recorded."); setNotes((current) => ({ ...current, [request.id]: "" })); await load(); }
    setSaving(null);
  }

  return <div className="management-movement-module">
    <header className="management-movement-header"><div><span className="eyebrow">MANAGEMENT APPROVAL DESK</span><h1>{historyOnly ? "Decision History" : "Movement Requests"}</h1><p>Decide only on official requests forwarded by the State Coordinator.</p></div><span className="live-label">LIVE RECORDS</span></header>
    <div className="management-movement-notice"><strong>Restricted authority:</strong> This workspace is limited to final movement decisions. LGA plans, working-day approvals and general administration are outside this role.</div>
    {error && <div className="plans-notice" role="alert">{error}</div>}{notice && <div className="plans-notice" role="status">{notice}</div>}
    <div className="management-movement-summary"><article className="panel"><span>Awaiting decision</span><strong>{pending}</strong></article><article className="panel"><span>Approved</span><strong>{approved}</strong></article><article className="panel"><span>Rejected</span><strong>{rejected}</strong></article></div>
    <section className="panel"><div className="panel-heading"><div><h2>{historyOnly ? "Recorded management decisions" : "Forwarded movement requests"}</h2><p>Persistent requests and append-only decision history.</p></div><div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending_management">Awaiting decision</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="decided">Decided</option><option value="all">All visible</option></select> <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div></div>
      {loading ? <div className="plan-empty">Loading movement requests…</div> : error ? null : visible.length === 0 ? <div className="plan-empty">No movement requests are available for this view.</div> : <div className="management-movement-list">{visible.map((request) => <article className="management-movement-card" key={request.id}>
        <div className="management-movement-card-header"><div><h3>{names[request.lga_id] ?? "LGA"} LGA movement request</h3><span>Requester {request.requested_by.slice(0, 8)} · Forwarded {new Date(request.created_at).toLocaleString("en-GB")}</span></div><span className={`status-badge ${request.status === "approved" ? "approved" : request.status === "rejected" ? "rejected" : "pending"}`}>{request.status.replaceAll("_", " ")}</span></div>
        <div className="management-movement-details"><div><span>Destination</span><strong>{request.destination}</strong></div><div><span>Departure</span><strong>{new Date(request.departure_at).toLocaleString("en-GB")}</strong></div><div><span>Expected return</span><strong>{new Date(request.expected_return_at).toLocaleString("en-GB")}</strong></div></div>
        <div className="management-movement-reason"><strong>Purpose of movement</strong><p>{request.reason}</p></div>
        <div className="movement-workflow-note"><strong>State recommendation</strong><p>{request.state_recommendation || "No recommendation recorded"}</p></div>
        {request.status === "pending_management" ? <div className="management-decision-form"><label>Decision note (required)<textarea minLength={3} value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Record why this request is approved or rejected." /></label><div className="management-decision-actions"><button type="button" className="secondary-button" disabled={saving === request.id || (notes[request.id] ?? "").trim().length < 3} onClick={() => void decide(request, "rejected")}>{saving === request.id ? "Saving…" : "Reject request"}</button><button type="button" className="primary-button" disabled={saving === request.id || (notes[request.id] ?? "").trim().length < 3} onClick={() => void decide(request, "approved")}>{saving === request.id ? "Saving…" : "Approve movement"}</button></div></div> : <div className="management-decision-history"><strong>Management decision</strong><p>{request.management_decision_note || "No decision note recorded"}</p><span>{request.management_decided_at ? new Date(request.management_decided_at).toLocaleString("en-GB") : ""}</span></div>}
        <div className="movement-decision-history"><strong>Decision history</strong>{history.filter((entry) => entry.movement_request_id === request.id).map((entry) => <div className="movement-timeline-entry" key={entry.id}><span className="movement-timeline-dot"/><div><strong>{entry.action.replaceAll("_", " ")}</strong><span>{entry.actor_role.replaceAll("_", " ")} · {new Date(entry.occurred_at).toLocaleString("en-GB")}</span><p>{entry.decision_note || "No note recorded"}</p></div></div>)}</div>
      </article>)}</div>}
    </section>
  </div>;
}
