"use client";

import { useState } from "react";

type Report = {
  id: number;
  period: "Weekly" | "Monthly";
  startDate: string;
  endDate: string;
  achievements: string;
  challenges: string;
  recommendations: string;
  submittedAt: string;
  status: "Draft" | "Submitted";
};

export default function MyReports() {
  const [period, setPeriod] = useState<"Weekly" | "Monthly">("Weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [achievements, setAchievements] = useState("");
  const [challenges, setChallenges] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [notice, setNotice] = useState("");

  const submitted = reports.filter((report) => report.status === "Submitted").length;
  const drafts = reports.filter((report) => report.status === "Draft").length;

  function saveReport(status: "Draft" | "Submitted") {
    if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) {
      setNotice("Enter a valid reporting period. The end date cannot be before the start date.");
      return;
    }

    if (status === "Submitted" && !achievements.trim()) {
      setNotice("Record at least one achievement before submitting your report.");
      return;
    }

    const report: Report = {
      id: Date.now(),
      period,
      startDate,
      endDate,
      achievements: achievements.trim(),
      challenges: challenges.trim(),
      recommendations: recommendations.trim(),
      submittedAt: new Date().toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      status,
    };

    setReports((previous) => [report, ...previous]);
    setStartDate("");
    setEndDate("");
    setAchievements("");
    setChallenges("");
    setRecommendations("");
    setNotice(
      status === "Submitted"
        ? "Report submitted in demo mode. Supervisor review is not connected."
        : "Report saved as a demo draft."
    );
  }

  return (
    <div className="reports-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="reports-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>My Reports</h2>
          <p>Prepare and submit your weekly and monthly activity reports.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
      </div>

      <div className="reports-summary-grid">
        <article className="plan-summary-card">
          <span>Total reports</span>
          <strong>{reports.length}</strong>
          <small>Reports created</small>
        </article>
        <article className="plan-summary-card">
          <span>Submitted</span>
          <strong>{submitted}</strong>
          <small>Awaiting supervisor workflow</small>
        </article>
        <article className="plan-summary-card">
          <span>Drafts</span>
          <strong>{drafts}</strong>
          <small>Not yet submitted</small>
        </article>
        <article className="plan-summary-card">
          <span>Reporting formats</span>
          <strong>2</strong>
          <small>Weekly and monthly</small>
        </article>
      </div>

      <section className="panel reports-form-panel">
        <div className="panel-heading">
          <div>
            <h3>Prepare activity report</h3>
            <p>Summarise your work and operational performance for the selected period.</p>
          </div>
          <span className="live-label">NEW REPORT</span>
        </div>

        <div className="reports-period-selector">
          <button
            type="button"
            className={period === "Weekly" ? "reports-period-active" : ""}
            onClick={() => setPeriod("Weekly")}
          >
            Weekly Report
          </button>
          <button
            type="button"
            className={period === "Monthly" ? "reports-period-active" : ""}
            onClick={() => setPeriod("Monthly")}
          >
            Monthly Report
          </button>
        </div>

        <div className="reports-fields-grid">
          <label className="reports-field">
            <span>Reporting period start *</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </label>

          <label className="reports-field">
            <span>Reporting period end *</span>
            <input
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </label>

          <label className="reports-field reports-field-wide">
            <span>Achievements and activities completed *</span>
            <textarea
              rows={5}
              value={achievements}
              onChange={(event) => setAchievements(event.target.value)}
              placeholder="Describe activities completed, targets achieved and important results..."
            />
          </label>

          <label className="reports-field reports-field-wide">
            <span>Challenges and operational constraints</span>
            <textarea
              rows={4}
              value={challenges}
              onChange={(event) => setChallenges(event.target.value)}
              placeholder="Describe challenges, delays, resource gaps and unresolved issues..."
            />
          </label>

          <label className="reports-field reports-field-wide">
            <span>Recommendations and support required</span>
            <textarea
              rows={4}
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
              placeholder="Describe recommended actions and support required from supervisors or management..."
            />
          </label>
        </div>

        <div className="reports-workflow-note">
          <strong>Report review process</strong>
          <p>Submitted reports will be routed to the appropriate supervisor for review. Submission does not mean the report has been verified or approved.</p>
        </div>

        <div className="reports-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => saveReport("Draft")}
          >
            Save draft
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => saveReport("Submitted")}
          >
            Submit report →
          </button>
        </div>
      </section>

      <section className="panel reports-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Report history</h3>
            <p>Previously created weekly and monthly reports.</p>
          </div>
          <span className="live-label">{reports.length} REPORTS</span>
        </div>

        {reports.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">▤</div>
            <strong>No reports created</strong>
            <p>Your reports will appear here after saving or submitting.</p>
          </div>
        ) : (
          reports.map((report) => (
            <article className="reports-history-card" key={report.id}>
              <div className="reports-history-header">
                <div>
                  <strong>{report.period} Activity Report</strong>
                  <span>{report.startDate} to {report.endDate}</span>
                </div>
                <span className={`plan-status ${
                  report.status === "Submitted"
                    ? "plan-status-completed"
                    : "plan-status-ongoing"
                }`}>
                  {report.status}
                </span>
              </div>

              <div className="reports-history-content">
                <div>
                  <strong>Achievements</strong>
                  <p>{report.achievements || "No achievements recorded."}</p>
                </div>
                <div>
                  <strong>Challenges</strong>
                  <p>{report.challenges || "No challenges recorded."}</p>
                </div>
                <div>
                  <strong>Recommendations</strong>
                  <p>{report.recommendations || "No recommendations recorded."}</p>
                </div>
              </div>

              <small className="reports-submission-time">
                Saved: {report.submittedAt}
              </small>
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Report integrity</strong>
        <p>This is a manual reporting interface in demo mode. Automatic aggregation of plans, tasks, working days, campaign readiness and supervision records, as well as PDF/Excel generation and supervisor review, will be connected to the database later.</p>
      </div>
    </div>
  );
}
