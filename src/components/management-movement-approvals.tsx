"use client";

import { useMemo, useState } from "react";

type MovementStatus = "Pending Management Decision" | "Approved" | "Rejected";

type MovementRequest = {
  id: number;
  lga: string;
  officer: string;
  destination: string;
  reason: string;
  departure: string;
  returnDate: string;
  forwardedBy: string;
  forwardedAt: string;
  status: MovementStatus;
  decisionReason: string;
  decidedAt: string;
};

const initialRequests: MovementRequest[] = [
  {
    id: 1,
    lga: "Fune",
    officer: "Bashir Abubakar",
    destination: "Damaturu",
    reason: "Official state-level coordination meeting.",
    departure: "2026-11-05 07:00",
    returnDate: "2026-11-05 18:00",
    forwardedBy: "State Coordinator",
    forwardedAt: "2026-11-03 09:15",
    status: "Pending Management Decision",
    decisionReason: "",
    decidedAt: "",
  },
  {
    id: 2,
    lga: "Bade",
    officer: "Haruna Bello Ibrahim",
    destination: "Damaturu",
    reason: "Approved programme review meeting.",
    departure: "2026-11-06 08:00",
    returnDate: "2026-11-06 17:00",
    forwardedBy: "State Coordinator",
    forwardedAt: "2026-11-03 10:30",
    status: "Pending Management Decision",
    decisionReason: "",
    decidedAt: "",
  },
];

export default function ManagementMovementApprovals() {
  const [requests, setRequests] = useState<MovementRequest[]>(initialRequests);
  const [filter, setFilter] = useState("Pending Management Decision");
  const [decisionReasons, setDecisionReasons] = useState<Record<number, string>>({});
  const [activeRequest, setActiveRequest] = useState<number | null>(null);

  const filteredRequests = useMemo(
    () => requests.filter((request) => filter === "All" || request.status === filter),
    [requests, filter]
  );

  const pending = requests.filter((request) => request.status === "Pending Management Decision").length;
  const approved = requests.filter((request) => request.status === "Approved").length;
  const rejected = requests.filter((request) => request.status === "Rejected").length;

  function decide(id: number, decision: "Approved" | "Rejected") {
    const reason = (decisionReasons[id] || "").trim();

    if (!reason) {
      alert("A written reason is required for every management decision.");
      return;
    }

    setRequests((current) => current.map((request) => request.id === id ? {
      ...request,
      status: decision,
      decisionReason: reason,
      decidedAt: new Date().toLocaleString(),
    } : request));

    setDecisionReasons((current) => ({ ...current, [id]: "" }));
    setActiveRequest(null);
  }

  return (
    <div className="management-movement-module">
      <header className="management-movement-header">
        <div>
          <span className="eyebrow">MANAGEMENT APPROVAL DESK</span>
          <h1>Movement Requests</h1>
          <p>Decide only on official movement requests forwarded by the State Coordinator.</p>
        </div>
        <span className="live-label">DEMO DATA</span>
      </header>

      <div className="management-movement-notice">
        <strong>Restricted authority:</strong> This workspace is limited to movement decisions. It does not grant access to LGA plans, working-day approvals, campaign monitoring or general administration.
      </div>

      <div className="management-movement-summary">
        <article className="panel"><span>Awaiting decision</span><strong>{pending}</strong></article>
        <article className="panel"><span>Approved</span><strong>{approved}</strong></article>
        <article className="panel"><span>Rejected</span><strong>{rejected}</strong></article>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Forwarded movement requests</h2><p>Requests recommended by the State Coordinator.</p></div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>Pending Management Decision</option>
            <option>Approved</option>
            <option>Rejected</option>
            <option>All</option>
          </select>
        </div>

        <div className="management-movement-list">
          {filteredRequests.map((request) => (
            <article className="management-movement-card" key={request.id}>
              <div className="management-movement-card-header">
                <div>
                  <h3>{request.lga} LGA — {request.officer}</h3>
                  <span>Forwarded by {request.forwardedBy} · {request.forwardedAt}</span>
                </div>
                <span className={`status-badge ${request.status === "Approved" ? "approved" : request.status === "Rejected" ? "rejected" : "pending"}`}>
                  {request.status}
                </span>
              </div>

              <div className="management-movement-details">
                <div><span>Destination</span><strong>{request.destination}</strong></div>
                <div><span>Departure</span><strong>{request.departure}</strong></div>
                <div><span>Expected return</span><strong>{request.returnDate}</strong></div>
              </div>

              <div className="management-movement-reason">
                <strong>Purpose of movement</strong>
                <p>{request.reason}</p>
              </div>

              {request.status === "Pending Management Decision" ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setActiveRequest(activeRequest === request.id ? null : request.id)}
                  >
                    {activeRequest === request.id ? "Close decision panel" : "Make management decision"}
                  </button>

                  {activeRequest === request.id && (
                    <div className="management-decision-form">
                      <label>
                        Decision reason (required)
                        <textarea
                          value={decisionReasons[request.id] || ""}
                          onChange={(event) => setDecisionReasons((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))}
                          placeholder="Explain the basis for approving or rejecting this movement..."
                        />
                      </label>
                      <div className="management-decision-actions">
                        <button type="button" className="secondary-button" onClick={() => decide(request.id, "Rejected")}>
                          Reject request
                        </button>
                        <button type="button" className="primary-button" onClick={() => decide(request.id, "Approved")}>
                          Approve movement
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="management-decision-history">
                  <strong>Management decision</strong>
                  <p>{request.decisionReason}</p>
                  <span>Decision recorded: {request.decidedAt}</span>
                </div>
              )}
            </article>
          ))}

          {filteredRequests.length === 0 && (
            <div className="plan-empty">No forwarded movement requests match this filter.</div>
          )}
        </div>
      </section>

      <div className="plans-notice">
        <strong>Prototype boundary:</strong> These are sample requests held in local browser state. Production must retrieve only requests forwarded to Management, enforce permissions server-side, preserve the State Coordinator's recommendation, and write every decision to an immutable audit history.
      </div>
    </div>
  );
}
