"use client";

import { useState } from "react";

type DeviceRecord = {
  id: number;
  date: string;
  activity: string;
  expected: number;
  completed: number;
  pending: number;
  description: string;
  blockers: string;
  evidence: string;
};

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function DeviceProgress() {
  const [records, setRecords] = useState<DeviceRecord[]>([]);
  const [activity, setActivity] = useState("");
  const [expected, setExpected] = useState("");
  const [completed, setCompleted] = useState("");
  const [description, setDescription] = useState("");
  const [blockers, setBlockers] = useState("");
  const [evidence, setEvidence] = useState("");
  const [notice, setNotice] = useState("");

  const expectedTotal = records.reduce((sum, item) => sum + item.expected, 0);
  const completedTotal = records.reduce((sum, item) => sum + item.completed, 0);
  const pendingTotal = records.reduce((sum, item) => sum + item.pending, 0);
  const achievement = expectedTotal > 0
    ? Math.round((completedTotal / expectedTotal) * 100)
    : 0;

  function submitProgress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const expectedCount = Number(expected);
    const completedCount = Number(completed);

    if (
      !activity.trim() ||
      expected.trim() === "" ||
      completed.trim() === "" ||
      !Number.isInteger(expectedCount) ||
      !Number.isInteger(completedCount) ||
      expectedCount < 0 ||
      completedCount < 0
    ) {
      setNotice("Enter an activity and valid non-negative whole numbers.");
      return;
    }

    if (expectedCount === 0 || completedCount > expectedCount) {
      setNotice("Expected devices must be greater than zero, and completed devices cannot exceed expected devices.");
      return;
    }

    setRecords((previous) => [
      {
        id: Date.now(),
        date: localDateKey(),
        activity: activity.trim(),
        expected: expectedCount,
        completed: completedCount,
        pending: expectedCount - completedCount,
        description: description.trim(),
        blockers: blockers.trim(),
        evidence: evidence.trim(),
      },
      ...previous,
    ]);

    setActivity("");
    setExpected("");
    setCompleted("");
    setDescription("");
    setBlockers("");
    setEvidence("");
    setNotice("Device progress recorded in demo mode. Database submission is not connected.");
  }

  return (
    <div className="device-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="device-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Device Progress</h2>
          <p>Track device deployment, installation, and campaign progress.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
      </div>

      <div className="device-summary-grid">
        <article className="plan-summary-card">
          <span>Expected devices</span>
          <strong>{expectedTotal}</strong>
          <small>Across recorded updates</small>
        </article>
        <article className="plan-summary-card">
          <span>Completed devices</span>
          <strong>{completedTotal}</strong>
          <small>Reported achievements</small>
        </article>
        <article className="plan-summary-card">
          <span>Pending devices</span>
          <strong>{pendingTotal}</strong>
          <small>Remaining work</small>
        </article>
        <article className="plan-summary-card">
          <span>Achievement</span>
          <strong>{achievement}%</strong>
          <small>Completed against expected</small>
        </article>
      </div>

      <section className="panel device-progress-panel">
        <div className="panel-heading">
          <div>
            <h3>Record device progress</h3>
            <p>Submit an update for a specific device activity.</p>
          </div>
          <span className="live-label">PROGRESS UPDATE</span>
        </div>

        <form onSubmit={submitProgress}>
          <div className="device-fields-grid">
            <label className="device-field device-field-wide">
              <span>Device activity</span>
              <input
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
                placeholder="e.g. GTS installation and configuration"
                required
              />
            </label>

            <label className="device-field">
              <span>Expected devices</span>
              <input
                type="number"
                min="1"
                step="1"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="Enter expected quantity"
                required
              />
            </label>

            <label className="device-field">
              <span>Completed devices</span>
              <input
                type="number"
                min="0"
                step="1"
                value={completed}
                onChange={(event) => setCompleted(event.target.value)}
                placeholder="Enter completed quantity"
                required
              />
            </label>

            <label className="device-field device-field-wide">
              <span>Achievement description</span>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the work completed and current progress..."
              />
            </label>

            <label className="device-field device-field-wide">
              <span>Blockers and challenges</span>
              <textarea
                rows={3}
                value={blockers}
                onChange={(event) => setBlockers(event.target.value)}
                placeholder="Describe any pending issues or support required..."
              />
            </label>

            <label className="device-field device-field-wide">
              <span>Evidence reference</span>
              <input
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="Optional photo filename or evidence reference"
              />
              <small>This demo accepts a reference only. Actual file uploads will be connected later.</small>
            </label>
          </div>

          <button className="primary-button" type="submit">
            Save progress update →
          </button>
        </form>
      </section>

      <section className="panel device-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Device progress history</h3>
            <p>Recorded device activity updates</p>
          </div>
          <span className="live-label">{records.length} UPDATES</span>
        </div>

        {records.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">▦</div>
            <strong>No device updates recorded</strong>
            <p>Your submitted device progress will appear here.</p>
          </div>
        ) : (
          records.map((record) => (
            <article className="device-history-row" key={record.id}>
              <div className="device-history-header">
                <div>
                  <strong>{record.activity}</strong>
                  <span>{record.date}</span>
                </div>
                <span className="plan-status plan-status-ongoing">
                  {Math.round((record.completed / record.expected) * 100)}% achieved
                </span>
              </div>

              <div className="device-progress-bar">
                <span style={{ width: `${(record.completed / record.expected) * 100}%` }} />
              </div>

              <div className="device-history-counts">
                <span>Expected: <strong>{record.expected}</strong></span>
                <span>Completed: <strong>{record.completed}</strong></span>
                <span>Pending: <strong>{record.pending}</strong></span>
              </div>

              {record.description && (
                <p className="device-history-description">{record.description}</p>
              )}

              {record.blockers && (
                <div className="device-blocker-note">
                  <strong>Blockers</strong>
                  <p>{record.blockers}</p>
                </div>
              )}

              {record.evidence && (
                <div className="device-evidence-reference">
                  <span>Evidence reference:</span> {record.evidence}
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Progress reporting</strong>
        <p>Each submission is a dated progress update. Completed counts are reported achievements, not independently verified device installations. Supervisor review and permanent evidence storage will be connected later.</p>
      </div>
    </div>
  );
}
