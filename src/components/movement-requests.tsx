"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canLgaResubmit, canStateReview, hasRequiredDecisionNote, validateMovementSubmission } from "@/lib/movement-workflow.mjs";

type LgaRequest = {
  id: string; requested_by: string; destination: string; reason: string;
  departure_at: string; expected_return_at: string; status: string; created_at: string;
  state_recommendation: string | null;
};
type LgaHistory = { id: string; movement_request_id: string; actor_role: string; action: string; decision_note: string | null; occurred_at: string };
type RevisedRequest = { destination: string; reason: string; departure: string; expectedReturn: string };

function localDateTimeValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function LgaMovementRequests({ userId, lgaId }: { userId: string; lgaId: string }) {
  const [requests, setRequests] = useState<LgaRequest[]>([]);
  const [history, setHistory] = useState<LgaHistory[]>([]);
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [departure, setDeparture] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [revisions, setRevisions] = useState<Record<string, RevisedRequest>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const db = createClient();
    const [requestResult, historyResult] = await Promise.all([
      db.from("movement_requests").select("id,requested_by,destination,reason,departure_at,expected_return_at,status,created_at,state_recommendation").eq("requested_by", userId).order("created_at", { ascending: false }),
      db.from("movement_request_history").select("id,movement_request_id,actor_role,action,decision_note,occurred_at").order("occurred_at", { ascending: true }),
    ]);
    const failure = requestResult.error ?? historyResult.error;
    if (failure) setError(failure.message);
    else { setRequests((requestResult.data ?? []) as LgaRequest[]); setHistory((historyResult.data ?? []) as LgaHistory[]); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const validationError = validateMovementSubmission({ destination, reason, departure, expectedReturn });
    if (validationError) { setError(validationError); return; }

    savingRef.current = true; setSaving(true); setError(""); setNotice("");
    const db = createClient();
    const departureAt = new Date(departure).toISOString();
    const returnAt = new Date(expectedReturn).toISOString();
    const { data: duplicate, error: duplicateError } = await db.from("movement_requests").select("id")
      .eq("lga_id", lgaId).eq("requested_by", userId).eq("destination", destination.trim()).eq("reason", reason.trim())
      .eq("departure_at", departureAt).eq("expected_return_at", returnAt)
      .in("status", ["pending_state_review", "returned_to_lga", "pending_management"]).limit(1).maybeSingle();
    if (duplicateError) { setError(duplicateError.message); savingRef.current = false; setSaving(false); return; }
    if (duplicate) { setError("An identical movement request is already active. Refresh its status before submitting again."); savingRef.current = false; setSaving(false); return; }
    const { error: insertError } = await db.from("movement_requests").insert({
      lga_id: lgaId, requested_by: userId, destination: destination.trim(), reason: reason.trim(),
      departure_at: departureAt, expected_return_at: returnAt,
    });
    if (insertError) { setError(insertError.message); savingRef.current = false; setSaving(false); return; }
    setDestination("");
    setReason("");
    setDeparture("");
    setExpectedReturn("");
    setNotice("Movement request submitted to State Coordinator review.");
    await load(); savingRef.current = false; setSaving(false);
  }

  async function resubmit(request: LgaRequest) {
    if (savingRef.current) return;
    if (!canLgaResubmit(request.status)) { setError("This request is no longer eligible for resubmission. Refresh the list."); return; }
    const fields = revisions[request.id] ?? {
      destination: request.destination,
      reason: request.reason,
      departure: localDateTimeValue(request.departure_at),
      expectedReturn: localDateTimeValue(request.expected_return_at),
    };
    const validationError = validateMovementSubmission(fields);
    if (validationError) { setError(validationError); return; }
    savingRef.current = true;
    setSaving(true); setError("");
    const { data, error: updateError } = await createClient().from("movement_requests").update({
      reason: fields.reason.trim(),
      destination: fields.destination.trim(),
      departure_at: new Date(fields.departure).toISOString(),
      expected_return_at: new Date(fields.expectedReturn).toISOString(),
      status: "pending_state_review",
      state_reviewed_by: null,
      state_reviewed_at: null,
      state_recommendation: null,
      management_decided_by: null,
      management_decided_at: null,
      management_decision_note: null,
    }).eq("id", request.id).eq("status", "returned_to_lga").eq("requested_by", userId).select("id").maybeSingle();
    if (updateError) setError(updateError.message);
    else if (!data) setError("This request is no longer returned to you. Refresh and review its current status.");
    else { setNotice("Revised request resubmitted for State review."); setRevisions((current) => { const next = { ...current }; delete next[request.id]; return next; }); await load(); }
    savingRef.current = false; setSaving(false);
  }

  const pendingCount = requests.filter((request) => request.status === "pending_state_review").length;
  const returnedCount = requests.filter((request) => request.status === "returned_to_lga").length;
  const approvedCount = requests.filter((request) => request.status === "approved").length;

  return (
    <div className="movement-module">
      {(error || notice) && (
        <div className="plans-notice">
          <span role={error ? "alert" : "status"}>{error || notice}</span>
          <button onClick={() => { setNotice(""); setError(""); }}>×</button>
        </div>
      )}

      <div className="movement-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Movement Requests</h2>
          <p>Submit official movement requests for State Coordinator review.</p>
        </div>
          <span className="live-label">LIVE RECORDS</span>
      </div>

      <div className="movement-summary-grid">
        <article className="plan-summary-card">
          <span>Total requests</span>
          <strong>{requests.length}</strong>
          <small>Submitted requests</small>
        </article>
        <article className="plan-summary-card">
          <span>Pending review</span>
          <strong>{pendingCount}</strong>
          <small>Awaiting State Coordinator</small>
        </article>
        <article className="plan-summary-card">
          <span>Returned</span>
          <strong>{returnedCount}</strong>
          <small>Requires LGA attention</small>
        </article>
        <article className="plan-summary-card">
          <span>Approved</span>
          <strong>{approvedCount}</strong>
          <small>Final management approval</small>
        </article>
      </div>

      <section className="panel movement-form-panel">
        <div className="panel-heading">
          <div>
            <h3>Submit movement request</h3>
            <p>Provide the details and justification for your proposed movement.</p>
          </div>
          <span className="live-label">NEW REQUEST</span>
        </div>

        <form onSubmit={submitRequest}>
          <div className="movement-fields-grid">
            <label className="movement-field movement-field-wide">
              <span>Destination *</span>
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Enter destination, LGA or facility"
                required
              />
            </label>

            <label className="movement-field">
              <span>Departure date and time *</span>
              <input
                type="datetime-local"
                value={departure}
                onChange={(event) => setDeparture(event.target.value)}
                required
              />
            </label>

            <label className="movement-field">
              <span>Expected return date and time *</span>
              <input
                type="datetime-local"
                value={expectedReturn}
                min={departure || undefined}
                onChange={(event) => setExpectedReturn(event.target.value)}
                required
              />
            </label>

            <label className="movement-field movement-field-wide">
              <span>Reason and justification *</span>
              <textarea
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the purpose of the movement, official activity and justification..."
                required
              />
            </label>
          </div>

          <div className="movement-workflow-note">
            <strong>Approval workflow</strong>
            <p>Your request first goes to the State Coordinator. If recommended, it is forwarded to the Management Approver for a final decision. Submission does not constitute permission to travel.</p>
          </div>

          <button className="primary-button" type="submit" disabled={saving || !lgaId}>
            {saving ? "Submitting…" : "Submit movement request →"}
          </button>
        </form>
      </section>

      <section className="panel movement-history-panel">
        <div className="panel-heading">
          <div>
            <h3>My movement requests</h3>
            <p>Track request status and decision history.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : `Refresh · ${requests.length}`}</button>
        </div>

        {loading ? <div className="plan-empty">Loading movement requests…</div> : error ? null : requests.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">↗</div>
            <strong>No movement requests submitted</strong>
            <p>Your submitted requests and decisions will appear here.</p>
          </div>
        ) : (
          requests.map((request) => (
            <article className="movement-history-card" key={request.id}>
              <div className="movement-history-header">
                <div>
                  <strong>{request.destination}</strong>
                  <span>Submitted {new Date(request.created_at).toLocaleString("en-GB")}</span>
                </div>
                <span className={`plan-status ${
                  request.status === "approved"
                    ? "plan-status-completed"
                    : request.status === "rejected"
                      ? "plan-status-returned"
                      : "plan-status-ongoing"
                }`}>
                  {request.status.replaceAll("_", " ")}
                </span>
              </div>

              <div className="movement-history-details">
                <div><span>Departure</span><strong>{new Date(request.departure_at).toLocaleString("en-GB")}</strong></div>
                <div><span>Expected return</span><strong>{new Date(request.expected_return_at).toLocaleString("en-GB")}</strong></div>
              </div>

              <p className="movement-reason-text">{request.reason}</p>

              {request.state_recommendation && <p><strong>State recommendation:</strong> {request.state_recommendation}</p>}
              {request.status === "returned_to_lga" && (() => {
                const fields = revisions[request.id] ?? { destination: request.destination, reason: request.reason, departure: localDateTimeValue(request.departure_at), expectedReturn: localDateTimeValue(request.expected_return_at) };
                return <div className="management-decision-form"><strong>Revise and resubmit</strong><label>Destination<input value={fields.destination} onChange={(event) => setRevisions((current) => ({ ...current, [request.id]: { ...fields, destination: event.target.value } }))} /></label><label>Reason<textarea value={fields.reason} onChange={(event) => setRevisions((current) => ({ ...current, [request.id]: { ...fields, reason: event.target.value } }))} /></label><label>Departure<input type="datetime-local" value={fields.departure} onChange={(event) => setRevisions((current) => ({ ...current, [request.id]: { ...fields, departure: event.target.value } }))} /></label><label>Expected return<input type="datetime-local" value={fields.expectedReturn} onChange={(event) => setRevisions((current) => ({ ...current, [request.id]: { ...fields, expectedReturn: event.target.value } }))} /></label><button type="button" className="primary-button" disabled={saving || Boolean(validateMovementSubmission(fields))} onClick={() => void resubmit(request)}>{saving ? "Submitting…" : "Resubmit to State"}</button></div>;
              })()}
              <div className="movement-decision-history">
                <strong>Decision history</strong>
                {history.filter((entry) => entry.movement_request_id === request.id).map((entry) => (
                  <div key={entry.id} className="movement-timeline-entry">
                    <span className="movement-timeline-dot" />
                    <div>
                      <strong>{entry.action.replaceAll("_", " ")}</strong>
                      <span>{entry.actor_role?.replaceAll("_", " ")} · {new Date(entry.occurred_at).toLocaleString("en-GB")}</span>
                      <p>{entry.decision_note || "No note recorded"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Movement authorization</strong>
        <p>Submitting a request does not authorize movement. Final approval belongs to the Management Approver after State Coordinator recommendation.</p>
      </div>
    </div>
  );
}

type StateRequest = {
  id: string;
  lga_id: string;
  requested_by: string;
  destination: string;
  reason: string;
  departure_at: string;
  expected_return_at: string;
  status: string;
  created_at: string;
  state_recommendation: string | null;
};

type RequestHistory = {
  id: string;
  movement_request_id: string;
  action: string;
  actor_role: string;
  decision_note: string | null;
  occurred_at: string;
};

function StateMovementReview({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<StateRequest[]>([]);
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [lgaNames, setLgaNames] = useState<Record<string, string>>({});
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const [requestResult, historyResult, lgaResult, profileResult] = await Promise.all([
      supabase.from("movement_requests").select("id,lga_id,requested_by,destination,reason,departure_at,expected_return_at,status,created_at,state_recommendation").order("created_at", { ascending: false }),
      supabase.from("movement_request_history").select("id,movement_request_id,action,actor_role,decision_note,occurred_at").order("occurred_at", { ascending: true }),
      supabase.from("lgas").select("id,name"),
      supabase.from("profiles").select("id,full_name"),
    ]);
    const failed = [requestResult.error, historyResult.error, lgaResult.error, profileResult.error].find(Boolean);
    if (failed) {
      setError(failed.message);
    } else {
      setRequests((requestResult.data ?? []) as StateRequest[]);
      setHistory((historyResult.data ?? []) as RequestHistory[]);
      setLgaNames(Object.fromEntries((lgaResult.data ?? []).map((row) => [row.id, row.name])));
      setProfileNames(Object.fromEntries((profileResult.data ?? []).map((row) => [row.id, row.full_name])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void loadRequests(); }, 0); return () => window.clearTimeout(timer); }, [loadRequests]);

  async function review(request: StateRequest, nextStatus: "pending_management" | "returned_to_lga") {
    const note = notes[request.id]?.trim() ?? "";
    if (!canStateReview(request.status)) {
      setError("This request is no longer available for State review. Refresh the list.");
      return;
    }
    if (!hasRequiredDecisionNote(note)) {
      setError("Enter a recommendation or return reason of at least 3 characters.");
      return;
    }
    setSaving(request.id);
    setError("");
    setNotice("");
    const supabase = createClient();
    const { data, error: updateError } = await supabase.from("movement_requests").update({
      status: nextStatus,
      state_reviewed_by: userId,
      state_reviewed_at: new Date().toISOString(),
      state_recommendation: note,
    }).eq("id", request.id).eq("status", request.status).select("id").maybeSingle();
    if (updateError) setError(updateError.message);
    else if (!data) setError("This request was already reviewed or is no longer available. Refresh the list.");
    else {
      setNotice(nextStatus === "pending_management" ? "Request forwarded to Management with your recommendation." : "Request returned to the LGA with a reason.");
      setNotes((current) => ({ ...current, [request.id]: "" }));
      await loadRequests();
    }
    setSaving(null);
  }

  const reviewable = requests.filter((request) => ["pending_state_review", "returned_to_lga"].includes(request.status));

  return <div className="movement-module">
    <header className="movement-heading"><div><span className="eyebrow">STATE COORDINATOR WORKSPACE</span><h2>Movement Requests</h2>
      <p>Review LGA submissions, record a recommendation, then forward to Management or return for correction.</p></div>
      <span className="live-label">LIVE RECORDS</span></header>
    {error && <div className="plans-notice" role="alert">{error}</div>}
    {notice && <div className="plans-notice" role="status">{notice}</div>}
    <section className="panel movement-history-panel"><div className="panel-heading"><div><h3>Requests awaiting State review</h3><p>{reviewable.length} pending or returned requests</p></div>
      <button type="button" className="secondary-button" onClick={() => void loadRequests()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
      {loading ? <div className="plan-empty">Loading movement requests…</div> : error ? null : requests.length === 0 ? <div className="plan-empty">No movement requests are available to your role.</div> : requests.map((request) => (
        <article className="movement-history-card" key={request.id}><div className="movement-history-header"><div><strong>{lgaNames[request.lga_id] ?? "LGA"} · {profileNames[request.requested_by] ?? "Coordinator"}</strong>
          <span>Submitted {new Date(request.created_at).toLocaleString("en-GB")}</span></div><span className="plan-status">{request.status.replaceAll("_", " ")}</span></div>
          <div className="movement-history-details"><div><span>Destination</span><strong>{request.destination}</strong></div><div><span>Departure</span><strong>{new Date(request.departure_at).toLocaleString("en-GB")}</strong></div><div><span>Expected return</span><strong>{new Date(request.expected_return_at).toLocaleString("en-GB")}</strong></div></div>
          <p className="movement-reason-text">{request.reason}</p>
          {request.state_recommendation && <p><strong>State recommendation:</strong> {request.state_recommendation}</p>}
          {history.filter((entry) => entry.movement_request_id === request.id).length > 0 && <div className="movement-decision-history"><strong>Decision history</strong>
            {history.filter((entry) => entry.movement_request_id === request.id).map((entry) => <div className="movement-timeline-entry" key={entry.id}><span className="movement-timeline-dot"/><div><strong>{entry.action.replaceAll("_", " ")}</strong><span>{entry.actor_role.replaceAll("_", " ")} · {new Date(entry.occurred_at).toLocaleString("en-GB")}</span><p>{entry.decision_note || "No note recorded"}</p></div></div>)}</div>}
          {["pending_state_review", "returned_to_lga"].includes(request.status) && <div className="management-decision-form"><label>Recommendation or reason (required)<textarea value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} minLength={3} /></label>
            <div className="management-decision-actions"><button type="button" className="secondary-button" disabled={saving === request.id || (notes[request.id] ?? "").trim().length < 3} onClick={() => void review(request, "returned_to_lga")}>{saving === request.id ? "Saving…" : "Return for correction"}</button>
              <button type="button" className="primary-button" disabled={saving === request.id || (notes[request.id] ?? "").trim().length < 3} onClick={() => void review(request, "pending_management")}>{saving === request.id ? "Saving…" : "Forward to Management"}</button></div></div>}
        </article>))}
    </section>
    <div className="checkin-privacy-note"><strong>Decision boundary</strong><p>State Coordinators may recommend or return a request. Only the Management Approver makes the final approve/reject decision.</p></div>
  </div>;
}

export default function MovementRequests({ userId, lgaId, role }: { userId: string; lgaId?: string | null; role: "lga_coordinator" | "state_coordinator" }) {
  return role === "state_coordinator" ? <StateMovementReview userId={userId} /> : lgaId ? <LgaMovementRequests userId={userId} lgaId={lgaId} /> : <div className="plans-notice" role="alert">Your account has no assigned LGA. Movement requests are unavailable.</div>;
}
