"use client";

import { useState } from "react";

type WorkDay = {
  id: number;
  date: string;
  note: string;
  status: "Pending review" | "Approved" | "Returned" | "Rejected";
  submittedAt: string;
  supervisorNote: string;
};

export default function WorkingDays() {
  const [records, setRecords] = useState<WorkDay[]>([]);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");

  const allocation = 15;
  const approved = records.filter((r) => r.status === "Approved").length;
  const pending = records.filter((r) => r.status === "Pending review").length;
  const claimed = records.length;
  const remaining = Math.max(0, allocation - approved);

  const filtered = filter === "All"
    ? records
    : records.filter((r) => r.status === filter);

  function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (records.some((r) => r.date === date)) {
      setNotice("A working-day claim already exists for this date.");
      return;
    }

    if (approved >= allocation) {
      setNotice("Your 15 approved working days have been used. Additional days require explicit supervisor authorization.");
      return;
    }

    const newRecord: WorkDay = {
      id: Date.now(),
      date,
      note: note.trim(),
      status: "Pending review",
      submittedAt: new Date().toISOString(),
      supervisorNote: "",
    };

    setRecords((previous) =>
      [...previous, newRecord].sort((a, b) => b.date.localeCompare(a.date))
    );

    setDate("");
    setNote("");
    setShowForm(false);
    setNotice("Working-day claim submitted in demo mode. It is not yet approved.");
  }

  return (
    <div className="working-days-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="working-days-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Working Days</h2>
          <p>Submit daily work claims and monitor supervisor approval.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
      </div>

      <section className="working-allocation-panel">
        <div>
          <span className="eyebrow">MONTHLY WORKING-DAY ALLOCATION</span>
          <h3>15 working days</h3>
          <p>Standard monthly operational allocation</p>
        </div>
        <div className="allocation-month">November 2026</div>
      </section>

      <div className="working-summary-grid">
        <article className="plan-summary-card">
          <span>Monthly allocation</span>
          <strong>{allocation}</strong>
          <small>Authorized standard days</small>
        </article>
        <article className="plan-summary-card">
          <span>Claimed days</span>
          <strong>{claimed}</strong>
          <small>All submitted claims</small>
        </article>
        <article className="plan-summary-card">
          <span>Approved days</span>
          <strong>{approved}</strong>
          <small>Supervisor verified</small>
        </article>
        <article className="plan-summary-card">
          <span>Remaining days</span>
          <strong>{remaining}</strong>
          <small>Based on approved days</small>
        </article>
      </div>

      <section className="working-usage-panel panel">
        <div className="panel-heading">
          <div>
            <h3>Allocation usage</h3>
            <p>Only approved days count against your monthly allocation.</p>
          </div>
          <strong>{approved} / {allocation}</strong>
        </div>
        <div className="plan-progress-track">
          <div
            className="plan-progress-fill"
            style={{ width: `${Math.min(100, approved / allocation * 100)}%` }}
          />
        </div>
        <div className="working-usage-legend">
          <span>{approved} approved</span>
          <span>{pending} pending review</span>
          <span>{remaining} remaining</span>
        </div>
      </section>

      <section className="panel working-records-panel">
        <div className="panel-heading working-records-heading">
          <div>
            <h3>Daily working-day records</h3>
            <p>Submit one claim for each date worked.</p>
          </div>
          <button
            className="primary-button"
            onClick={() => setShowForm(true)}
          >
            + Submit working day
          </button>
        </div>

        <div className="working-filter-row">
          <span className="working-record-count">{records.length} submitted records</span>
          <select
            className="plan-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {["All", "Pending review", "Approved", "Returned", "Rejected"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">▦</div>
            <strong>No working-day records</strong>
            <p>Submit a daily claim when you complete an operational working day.</p>
            <button
              className="plan-edit-button"
              onClick={() => setShowForm(true)}
            >
              Submit your first working day
            </button>
          </div>
        ) : (
          <div className="working-record-list">
            {filtered.map((record) => (
              <article className="working-record" key={record.id}>
                <div className="working-record-date">
                  <strong>{record.date}</strong>
                  <span>Submitted {new Date(record.submittedAt).toLocaleString()}</span>
                </div>

                <div className="working-record-note">
                  <span>WORK NOTE</span>
                  <p>{record.note || "No additional note provided."}</p>
                </div>

                <div className="working-record-status">
                  <span className={`plan-status ${
                    record.status === "Approved" ? "plan-status-completed" :
                    record.status === "Pending review" ? "plan-status-ongoing" :
                    "plan-status-returned"
                  }`}>
                    {record.status}
                  </span>
                  {record.supervisorNote && (
                    <p>{record.supervisorNote}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="working-policy-note">
        <strong>Important allocation rules</strong>
        <ul>
          <li>Monthly standard allocation is 15 working days.</li>
          <li>Only supervisor-approved days count as approved days.</li>
          <li>Submitting a claim does not automatically approve it.</li>
          <li>Days above the standard allocation require explicit authorization.</li>
          <li>Corrections and approval decisions must preserve an audit history.</li>
        </ul>
      </section>

      {showForm && (
        <div className="plan-modal-backdrop">
          <section className="plan-modal">
            <div className="plan-modal-heading">
              <div>
                <span className="eyebrow">DAILY ATTENDANCE RECORD</span>
                <h2>Submit working day</h2>
              </div>
              <button
                className="plan-modal-close"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={submitClaim}>
              <label className="plan-form-field">
                Working date *
                <input
                  type="date"
                  required
                  value={date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>

              <label className="plan-form-field">
                Work note
                <textarea
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Briefly describe the work performed."
                />
              </label>

              <div className="plan-form-note">
                Your submission will be recorded as Pending review. A supervisor must verify it before it counts toward approved working days. This demo does not save records to PostgreSQL.
              </div>

              <div className="plan-form-actions">
                <button
                  type="button"
                  className="plan-cancel-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Submit claim
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
