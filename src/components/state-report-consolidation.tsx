"use client";

import { useMemo, useState } from "react";

type ReportStatus = "Draft" | "Submitted to Senior Supervisor" | "Returned for correction" | "Approved";
type Report = {
  id: number;
  period: string;
  generatedBy: string;
  generatedAt: string;
  status: ReportStatus;
  summary: string;
  achievements: string;
  challenges: string;
  recommendations: string;
  reviewerComment: string;
};

const initialReport: Report = {
  id: 1,
  period: "November 2026",
  generatedBy: "State Coordinator (demo)",
  generatedAt: "2026-11-03 09:00",
  status: "Draft",
  summary: "",
  achievements: "",
  challenges: "",
  recommendations: "",
  reviewerComment: "",
};

const lgaNames = [
  "Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Jakusko",
  "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari",
];

const sampleMetrics = [
  { lga: "Bade", planned: 12, ongoing: 5, completed: 4, overdue: 1, returned: 1, verified: 3 },
  { lga: "Bursari", planned: 10, ongoing: 4, completed: 3, overdue: 2, returned: 0, verified: 2 },
  { lga: "Damaturu", planned: 15, ongoing: 7, completed: 5, overdue: 1, returned: 2, verified: 4 },
  { lga: "Fika", planned: 11, ongoing: 5, completed: 3, overdue: 1, returned: 1, verified: 2 },
  { lga: "Fune", planned: 13, ongoing: 6, completed: 4, overdue: 2, returned: 1, verified: 3 },
];

type Role = "state_coordinator" | "senior_supervisor";

export default function StateReportConsolidation() {
  const [role, setRole] = useState<Role>("state_coordinator");
  const [report, setReport] = useState<Report>(initialReport);
  const [history, setHistory] = useState<Report[]>([]);
  const [reviewComment, setReviewComment] = useState("");

  const totals = useMemo(() => sampleMetrics.reduce((sum, row) => ({
    planned: sum.planned + row.planned,
    ongoing: sum.ongoing + row.ongoing,
    completed: sum.completed + row.completed,
    overdue: sum.overdue + row.overdue,
    returned: sum.returned + row.returned,
    verified: sum.verified + row.verified,
  }), { planned: 0, ongoing: 0, completed: 0, overdue: 0, returned: 0, verified: 0 }), []);

  const sampleCoverage = `${sampleMetrics.length} of ${lgaNames.length} LGAs`;

  function update(field: keyof Report, value: string) {
    setReport((current) => ({ ...current, [field]: value }));
  }

  function saveDraft() {
    setReport((current) => ({ ...current, status: "Draft" }));
    alert("Draft saved in this browser session only.");
  }

  function submitToSenior() {
    if (!report.summary.trim() || !report.achievements.trim()) {
      alert("Add the executive summary and achievements before submitting.");
      return;
    }

    const submitted = {
      ...report,
      status: "Submitted to Senior Supervisor" as ReportStatus,
      generatedAt: new Date().toLocaleString(),
    };
    setReport(submitted);
    setHistory((current) => [submitted, ...current]);
    alert("Demo report submitted to the Senior Supervisor.");
  }

  function seniorDecision(decision: "Approved" | "Returned for correction") {
    if (decision === "Returned for correction" && !reviewComment.trim()) {
      alert("A reason is required when returning a report.");
      return;
    }

    const reviewed = {
      ...report,
      status: decision,
      reviewerComment: reviewComment.trim() || "Reviewed and approved.",
      generatedAt: new Date().toLocaleString(),
    };
    setReport(reviewed);
    setHistory((current) => [reviewed, ...current]);
    setReviewComment("");
    alert(`Demo report ${decision.toLowerCase()}.`);
  }

  return (
    <div className="state-report-module">
      <header className="state-report-header">
        <div>
          <span className="eyebrow">STATEWIDE REPORTING</span>
          <h1>State Report Consolidation</h1>
          <p>Prepare, review and approve monthly statewide operational reports.</p>
        </div>
        <span className="live-label">DEMO DATA</span>
      </header>

      <section className="panel state-report-role-panel">
        <label>
          Demo view
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="state_coordinator">State Coordinator</option>
            <option value="senior_supervisor">Senior Supervisor</option>
          </select>
        </label>
        <span>In production, this role will come from authenticated account permissions, not a selector.</span>
      </section>

      <div className="state-report-summary">
        <article className="panel"><span>LGAs in state</span><strong>16</strong><small>Official reporting coverage</small></article>
        <article className="panel"><span>Sample data coverage</span><strong>{sampleCoverage}</strong><small>Illustrative records only</small></article>
        <article className="panel"><span>Reported completed</span><strong>{totals.completed}</strong><small>Not necessarily verified</small></article>
        <article className="panel"><span>Supervisor verified</span><strong>{totals.verified}</strong><small>Sample verified records</small></article>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>LGA performance summary</h2><p>Sample metrics are not live programme results.</p></div>
          <span className="status-badge pending">Partial coverage</span>
        </div>
        <div className="state-report-table-wrap">
          <table className="state-report-table">
            <thead>
              <tr><th>LGA</th><th>Planned</th><th>Ongoing</th><th>Reported completed</th><th>Verified</th><th>Overdue</th><th>Returned</th></tr>
            </thead>
            <tbody>
              {sampleMetrics.map((row) => (
                <tr key={row.lga}>
                  <td><strong>{row.lga}</strong></td>
                  <td>{row.planned}</td><td>{row.ongoing}</td><td>{row.completed}</td><td>{row.verified}</td><td>{row.overdue}</td><td>{row.returned}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th>Sample total</th><th>{totals.planned}</th><th>{totals.ongoing}</th><th>{totals.completed}</th><th>{totals.verified}</th><th>{totals.overdue}</th><th>{totals.returned}</th></tr>
            </tfoot>
          </table>
        </div>
        <p className="state-report-note">This table currently covers five sample LGAs, not all 16. Missing LGA figures must remain missing until valid records are available.</p>
      </section>

      <section className="panel state-report-editor">
        <div className="panel-heading">
          <div><h2>{role === "state_coordinator" ? "Prepare statewide report" : "Review consolidated report"}</h2><p>Reporting period: {report.period}</p></div>
          <span className={`status-badge ${report.status === "Approved" ? "approved" : report.status === "Returned for correction" ? "returned" : "pending"}`}>{report.status}</span>
        </div>

        {role === "state_coordinator" ? (
          <>
            <label>Reporting period<input value={report.period} onChange={(event) => update("period", event.target.value)} /></label>
            <label>Executive summary<textarea value={report.summary} onChange={(event) => update("summary", event.target.value)} placeholder="Summarise statewide implementation and major findings..." /></label>
            <label>Achievements<textarea value={report.achievements} onChange={(event) => update("achievements", event.target.value)} placeholder="Describe verified achievements and relevant evidence..." /></label>
            <label>Challenges<textarea value={report.challenges} onChange={(event) => update("challenges", event.target.value)} placeholder="Describe operational challenges and affected LGAs..." /></label>
            <label>Recommendations<textarea value={report.recommendations} onChange={(event) => update("recommendations", event.target.value)} placeholder="State the recommended actions and responsible parties..." /></label>
            {report.reviewerComment && <div className="state-report-review-comment"><strong>Senior Supervisor feedback</strong><p>{report.reviewerComment}</p></div>}
            <div className="state-report-actions">
              <button type="button" className="secondary-button" onClick={saveDraft}>Save draft</button>
              <button type="button" className="primary-button" onClick={submitToSenior}>Submit to Senior Supervisor</button>
            </div>
          </>
        ) : (
          <>
            <div className="state-report-readonly">
              <h3>Executive summary</h3><p>{report.summary || "No executive summary submitted yet."}</p>
              <h3>Achievements</h3><p>{report.achievements || "No achievements submitted yet."}</p>
              <h3>Challenges</h3><p>{report.challenges || "No challenges submitted yet."}</p>
              <h3>Recommendations</h3><p>{report.recommendations || "No recommendations submitted yet."}</p>
            </div>
            <label>Review comment<textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Record review findings or corrections required..." /></label>
            <div className="state-report-actions">
              <button type="button" className="secondary-button" onClick={() => seniorDecision("Returned for correction")}>Return for correction</button>
              <button type="button" className="primary-button" onClick={() => seniorDecision("Approved")}>Approve consolidated report</button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Report history</h2><p>Demo session history of report actions.</p></div></div>
        {history.length === 0 ? (
          <div className="plan-empty">No report actions recorded in this session yet.</div>
        ) : (
          <div className="state-report-history">
            {history.map((item, index) => (
              <article key={`${item.id}-${index}`}>
                <strong>{item.period}</strong>
                <span>{item.status}</span>
                <small>{item.generatedAt}</small>
                {item.reviewerComment && <p>{item.reviewerComment}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="plans-notice">
        <strong>Prototype boundary:</strong> Report figures and workflow are local sample data. There is no database aggregation, PDF or Excel export, durable amendment history, or real role enforcement yet. The Boss must only receive a report after Senior Supervisor approval.
      </div>
    </div>
  );
}
