"use client";

import { useState } from "react";

type MovementRequest = {
  id: number;
  destination: string;
  reason: string;
  departure: string;
  expectedReturn: string;
  submittedAt: string;
  status: "Pending State Review" | "Returned to LGA" | "Recommended for Management" | "Approved" | "Rejected";
  history: {
    actor: string;
    role: string;
    action: string;
    reason: string;
    timestamp: string;
  }[];
};

function localTimestamp() {
  return new Date().toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function MovementRequests() {
  const [requests, setRequests] = useState<MovementRequest[]>([]);
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [departure, setDeparture] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notice, setNotice] = useState("");

  function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!destination.trim() || !reason.trim() || !departure || !expectedReturn) {
      setNotice("Complete all required movement request fields.");
      return;
    }

    if (new Date(expectedReturn) <= new Date(departure)) {
      setNotice("Expected return must be later than departure.");
      return;
    }

    const timestamp = localTimestamp();

    const request: MovementRequest = {
      id: Date.now(),
      destination: destination.trim(),
      reason: reason.trim(),
      departure,
      expectedReturn,
      submittedAt: timestamp,
      status: "Pending State Review",
      history: [
        {
          actor: "Bashir Abubakar",
          role: "LGA Coordinator",
          action: "Movement request submitted",
          reason: reason.trim(),
          timestamp,
        },
      ],
    };

    setRequests((previous) => [request, ...previous]);
    setDestination("");
    setReason("");
    setDeparture("");
    setExpectedReturn("");
    setNotice("Movement request submitted in demo mode. State review and database processing are not connected.");
  }

  const pendingCount = requests.filter(
    (request) => request.status === "Pending State Review"
  ).length;

  const returnedCount = requests.filter(
    (request) => request.status === "Returned to LGA"
  ).length;

  const approvedCount = requests.filter(
    (request) => request.status === "Approved"
  ).length;

  return (
    <div className="movement-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="movement-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Movement Requests</h2>
          <p>Submit official movement requests for State Coordinator review.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
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

          <button className="primary-button" type="submit">
            Submit movement request →
          </button>
        </form>
      </section>

      <section className="panel movement-history-panel">
        <div className="panel-heading">
          <div>
            <h3>My movement requests</h3>
            <p>Track request status and decision history.</p>
          </div>
          <span className="live-label">{requests.length} REQUESTS</span>
        </div>

        {requests.length === 0 ? (
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
                  <span>Submitted {request.submittedAt}</span>
                </div>
                <span className={`plan-status ${
                  request.status === "Approved"
                    ? "plan-status-completed"
                    : request.status === "Rejected"
                      ? "plan-status-returned"
                      : "plan-status-ongoing"
                }`}>
                  {request.status}
                </span>
              </div>

              <div className="movement-history-details">
                <div><span>Departure</span><strong>{request.departure.replace("T", " ")}</strong></div>
                <div><span>Expected return</span><strong>{request.expectedReturn.replace("T", " ")}</strong></div>
              </div>

              <p className="movement-reason-text">{request.reason}</p>

              <div className="movement-decision-history">
                <strong>Decision history</strong>
                {request.history.map((entry, index) => (
                  <div key={index} className="movement-timeline-entry">
                    <span className="movement-timeline-dot" />
                    <div>
                      <strong>{entry.action}</strong>
                      <span>{entry.actor} · {entry.role} · {entry.timestamp}</span>
                      <p>{entry.reason}</p>
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
        <p>Submitting a request does not authorize movement. Final approval belongs to the Management Approver after State Coordinator recommendation. This demo does not send requests to either authority or provide real travel authorization.</p>
      </div>
    </div>
  );
}
