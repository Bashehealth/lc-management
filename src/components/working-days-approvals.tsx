"use client";

import { useMemo, useState } from "react";

type ClaimStatus = "Pending" | "Approved" | "Returned";
type Claim = {
  id: number;
  lga: string;
  officer: string;
  date: string;
  note: string;
  status: ClaimStatus;
  reviewer: string;
  reason: string;
  reviewedAt: string;
};

const initialClaims: Claim[] = [
  { id: 1, lga: "Fune", officer: "Bashir Abubakar", date: "2026-11-02", note: "Routine LGA coordination and field monitoring.", status: "Pending", reviewer: "", reason: "", reviewedAt: "" },
  { id: 2, lga: "Damaturu", officer: "Mustapha Jibrin", date: "2026-11-02", note: "Supervision and programme coordination.", status: "Pending", reviewer: "", reason: "", reviewedAt: "" },
  { id: 3, lga: "Bade", officer: "Haruna Bello Ibrahim", date: "2026-11-01", note: "Weekly activity implementation.", status: "Approved", reviewer: "State Coordinator", reason: "Reviewed.", reviewedAt: "2026-11-02 14:20" },
  { id: 4, lga: "Nguru", officer: "Jamilu Aminu Yunusa", date: "2026-11-01", note: "Field monitoring.", status: "Returned", reviewer: "Senior Supervisor", reason: "Please provide a clearer description of the work performed.", reviewedAt: "2026-11-02 15:10" },
];

const lgas = [
  "Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Jakusko",
  "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari",
];

export default function WorkingDaysApprovals() {
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [filter, setFilter] = useState("All");
  const [selectedLga, setSelectedLga] = useState("All");
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<number, string>>({});
  const [activeClaim, setActiveClaim] = useState<number | null>(null);

  const reviewer = "Current Supervisor (demo)";

  const filteredClaims = useMemo(() => claims.filter((claim) =>
    (filter === "All" || claim.status === filter) &&
    (selectedLga === "All" || claim.lga === selectedLga)
  ), [claims, filter, selectedLga]);

  const approvedCount = claims.filter((claim) => claim.status === "Approved").length;
  const pendingCount = claims.filter((claim) => claim.status === "Pending").length;
  const returnedCount = claims.filter((claim) => claim.status === "Returned").length;

  function decideClaim(id: number, decision: "Approved" | "Returned") {
    const reason = (reviewReasons[id] || "").trim();

    if (decision === "Returned" && !reason) {
      alert("A reason is required before returning a claim.");
      return;
    }

    setClaims((current) => current.map((claim) => claim.id === id ? {
      ...claim,
      status: decision,
      reviewer,
      reason: reason || "Reviewed and approved.",
      reviewedAt: new Date().toLocaleString(),
    } : claim));

    setActiveClaim(null);
  }

  const approvedByLga = (lga: string) =>
    claims.filter((claim) => claim.lga === lga && claim.status === "Approved").length;

  return (
    <div className="working-approvals-module">
      <div className="working-approvals-header">
        <div>
          <span className="eyebrow">SUPERVISOR WORKSPACE</span>
          <h1>Working Days Approvals</h1>
          <p>Review LGA working-day claims and maintain an auditable approval record.</p>
        </div>
        <span className="live-label">DEMO DATA</span>
      </div>

      <div className="working-approvals-summary">
        <div className="panel">
          <span>Pending review</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="panel">
          <span>Approved claims</span>
          <strong>{approvedCount}</strong>
        </div>
        <div className="panel">
          <span>Returned claims</span>
          <strong>{returnedCount}</strong>
        </div>
        <div className="panel">
          <span>Monthly allocation</span>
          <strong>15 days</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Monthly LGA allocation overview</h2>
            <p>Approved claims counted against the standard 15-day allocation.</p>
          </div>
        </div>
        <div className="working-allocation-grid">
          {lgas.map((lga) => {
            const approved = approvedByLga(lga);
            const extra = allocation[lga] || 0;
            return (
              <div className="working-allocation-card" key={lga}>
                <strong>{lga}</strong>
                <span>{approved} / {15} approved days</span>
                <div className="allocation-track">
                  <span style={{ width: `${Math.min(100, approved / 15 * 100)}%` }} />
                </div>
                <small>{Math.max(0, 15 + extra - approved)} days remaining</small>
                {approved > 15 && <span className="status-badge warning">Over allocation</span>}
                <label>
                  Authorized additional days
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={extra}
                    onChange={(event) => setAllocation((current) => ({
                      ...current,
                      [lga]: Math.max(0, Math.min(15, Number(event.target.value) || 0)),
                    }))}
                  />
                </label>
                {extra > 0 && <small>Demo entry only — no authorization record has been created.</small>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Claim review queue</h2>
            <p>Each claim must be reviewed individually.</p>
          </div>
          <div className="working-approval-filters">
            <select value={selectedLga} onChange={(event) => setSelectedLga(event.target.value)}>
              <option value="All">All LGAs</option>
              {lgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
            </select>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Returned">Returned</option>
            </select>
          </div>
        </div>

        <div className="working-claim-list">
          {filteredClaims.map((claim) => (
            <article className="working-claim-card" key={claim.id}>
              <div className="working-claim-top">
                <div>
                  <h3>{claim.lga} LGA</h3>
                  <p>{claim.officer} · {claim.date}</p>
                </div>
                <span className={`status-badge ${claim.status.toLowerCase()}`}>{claim.status}</span>
              </div>
              <p>{claim.note}</p>

              {claim.reviewer && (
                <div className="working-review-history">
                  <strong>Review history</strong>
                  <span>{claim.reviewer} · {claim.reviewedAt}</span>
                  <p>{claim.reason}</p>
                </div>
              )}

              {claim.status === "Pending" && (
                <>
                  <button className="secondary-button" type="button" onClick={() => setActiveClaim(activeClaim === claim.id ? null : claim.id)}>
                    {activeClaim === claim.id ? "Close review" : "Review claim"}
                  </button>

                  {activeClaim === claim.id && (
                    <div className="working-claim-review-form">
                      <label>
                        Review comment
                        <textarea
                          value={reviewReasons[claim.id] || ""}
                          onChange={(event) => setReviewReasons((current) => ({ ...current, [claim.id]: event.target.value }))}
                          placeholder="Explain the decision or correction required..."
                        />
                      </label>
                      <div className="working-claim-actions">
                        <button type="button" className="secondary-button" onClick={() => decideClaim(claim.id, "Returned")}>Return claim</button>
                        <button type="button" className="primary-button" onClick={() => decideClaim(claim.id, "Approved")}>Approve claim</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}

          {filteredClaims.length === 0 && <div className="plan-empty">No claims match these filters.</div>}
        </div>
      </section>

      <div className="plans-notice">
        <strong>Payment control:</strong> This screen is a workflow prototype, not a payroll system. The 15-day allocation is the standard monthly limit. Additional days require a separate, traceable authorization. The number field above is only a visual placeholder and does not authorize extra days.
      </div>
    </div>
  );
}
