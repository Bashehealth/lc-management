"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DeviceRecord = { id: string; reported_at: string; activity_category: string; device_name: string; expected_quantity: number; completed_quantity: number; pending_quantity: number; progress_description: string | null; blockers: string | null };

export default function DeviceProgress({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const [records, setRecords] = useState<DeviceRecord[]>([]);
  const [activity, setActivity] = useState("");
  const [expected, setExpected] = useState("");
  const [completed, setCompleted] = useState("");
  const [description, setDescription] = useState("");
  const [blockers, setBlockers] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deviceName, setDeviceName] = useState("");

  const load = useCallback(async () => {
    if (!lgaId) { setError("Your account is not assigned to an LGA."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await createClient().from("campaign_device_progress").select("id,reported_at,activity_category,device_name,expected_quantity,completed_quantity,pending_quantity,progress_description,blockers").eq("lga_id", lgaId).order("reported_at", { ascending: false }).limit(100);
    if (queryError) setError(queryError.message); else setRecords((data ?? []) as DeviceRecord[]);
    setLoading(false);
  }, [lgaId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const expectedTotal = records.reduce((sum, item) => sum + item.expected_quantity, 0);
  const completedTotal = records.reduce((sum, item) => sum + item.completed_quantity, 0);
  const pendingTotal = records.reduce((sum, item) => sum + item.pending_quantity, 0);
  const achievement = expectedTotal > 0
    ? Math.round((completedTotal / expectedTotal) * 100)
    : 0;

  async function submitProgress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const expectedCount = Number(expected);
    const completedCount = Number(completed);

    if (
      !activity.trim() || !deviceName.trim() ||
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

    if (!lgaId || !userId || saving) return;
    setSaving(true); setError(""); setNotice("");
    const { error: insertError } = await createClient().from("campaign_device_progress").insert({
      lga_id: lgaId, submitted_by: userId, activity_category: activity.trim(), device_name: deviceName.trim(),
      expected_quantity: expectedCount, completed_quantity: completedCount, pending_quantity: expectedCount - completedCount,
      progress_description: description.trim() || null, blockers: blockers.trim() || null,
    });
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    setActivity("");
    setDeviceName("");
    setExpected("");
    setCompleted("");
    setDescription("");
    setBlockers("");
    setNotice("Device progress saved.");
    await load();
    setSaving(false);
  }

  return (
    <div className="device-module">
      {(notice || error) && (
        <div className="plans-notice">
          <span role={error ? "alert" : "status"}>{error || notice}</span>
          <button onClick={() => { setNotice(""); setError(""); }}>×</button>
        </div>
      )}

      <div className="device-heading">
        <div>
          <span className="eyebrow">ASSIGNED LGA</span>
          <h2>Device Progress</h2>
          <p>Track device deployment, installation, and campaign progress.</p>
        </div>
        <span className="live-label">LGA REPORTS</span>
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

            <label className="device-field device-field-wide">
              <span>Device name *</span>
              <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Enter device type or name" required />
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

            <div className="device-field device-field-wide"><span>Evidence upload</span><small>Secure storage is not configured. No file is uploaded or recorded.</small></div>
          </div>

          <button className="primary-button" type="submit" disabled={saving || loading || !lgaId}>
            {saving ? "Saving…" : "Save progress update →"}
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

        {loading ? <div className="plan-empty">Loading device history…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : records.length === 0 ? (
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
                  <strong>{record.device_name} · {record.activity_category}</strong>
                  <span>{new Date(record.reported_at).toLocaleString()}</span>
                </div>
                <span className="plan-status plan-status-ongoing">
                  {record.expected_quantity ? Math.round((record.completed_quantity / record.expected_quantity) * 100) : 0}% achieved
                </span>
              </div>

              <div className="device-progress-bar">
                <span style={{ width: `${record.expected_quantity ? (record.completed_quantity / record.expected_quantity) * 100 : 0}%` }} />
              </div>

              <div className="device-history-counts">
                <span>Expected: <strong>{record.expected_quantity}</strong></span>
                <span>Completed: <strong>{record.completed_quantity}</strong></span>
                <span>Pending: <strong>{record.pending_quantity}</strong></span>
              </div>

              {record.progress_description && (
                <p className="device-history-description">{record.progress_description}</p>
              )}

              {record.blockers && (
                <div className="device-blocker-note">
                  <strong>Blockers</strong>
                  <p>{record.blockers}</p>
                </div>
              )}

            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Progress reporting</strong>
        <p>Each submission is a dated progress update. Completed counts are reported achievements, not independently verified device installations. No evidence upload is available until secure storage is configured.</p>
      </div>
    </div>
  );
}
