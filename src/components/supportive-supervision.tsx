"use client";

import { useState } from "react";

type VisitRecord = {
  id: number;
  date: string;
  campaign: string;
  task: string;
  ward: string;
  settlement: string;
  teamCode: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  observations: string;
  followUp: string;
  evidence: string[];
};

const initialForm = {
  campaign: "",
  task: "",
  ward: "",
  settlement: "",
  teamCode: "",
  observations: "",
  followUp: "",
};

function localTimestamp() {
  return new Date().toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SupportiveSupervision() {
  const [form, setForm] = useState(initialForm);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState("");

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setNotice("Geolocation is not supported by this browser.");
      return;
    }

    setCapturing(true);
    setNotice("Requesting current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setCapturing(false);
        setNotice("Visit location captured.");
      },
      (error) => {
        setCapturing(false);
        setNotice(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Allow location access and try again."
            : error.code === error.TIMEOUT
              ? "Location request timed out. Try again."
              : "Unable to capture location."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function addEvidence(files: FileList | null) {
    if (!files) return;

    const names = Array.from(files).map((file) => file.name);
    setEvidence((previous) => [...previous, ...names]);
  }

  function removeEvidence(index: number) {
    setEvidence((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function submitVisit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !form.campaign.trim() ||
      !form.task.trim() ||
      !form.ward.trim() ||
      !form.settlement.trim() ||
      !form.teamCode.trim() ||
      !form.observations.trim()
    ) {
      setNotice("Complete all required visit details and observations.");
      return;
    }

    const visit: VisitRecord = {
      id: Date.now(),
      date: localTimestamp(),
      campaign: form.campaign.trim(),
      task: form.task.trim(),
      ward: form.ward.trim(),
      settlement: form.settlement.trim(),
      teamCode: form.teamCode.trim(),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      observations: form.observations.trim(),
      followUp: form.followUp.trim(),
      evidence: [...evidence],
    };

    setVisits((previous) => [visit, ...previous]);
    setForm(initialForm);
    setLocation(null);
    setEvidence([]);
    setNotice("Supervision visit recorded in demo mode. Database submission is not connected.");
  }

  return (
    <div className="supervision-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="supervision-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Supportive Supervision</h2>
          <p>Record and document field supervision visits linked to campaign tasks.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
      </div>

      <div className="supervision-summary-grid">
        <article className="plan-summary-card">
          <span>Total visits</span>
          <strong>{visits.length}</strong>
          <small>Recorded in this session</small>
        </article>
        <article className="plan-summary-card">
          <span>Evidence references</span>
          <strong>{visits.reduce((sum, visit) => sum + visit.evidence.length, 0)}</strong>
          <small>Selected file references</small>
        </article>
        <article className="plan-summary-card">
          <span>GPS captured</span>
          <strong>{visits.filter((visit) => visit.latitude !== null).length}</strong>
          <small>Visits with location evidence</small>
        </article>
        <article className="plan-summary-card">
          <span>Follow-up required</span>
          <strong>{visits.filter((visit) => visit.followUp.trim()).length}</strong>
          <small>Visits with recorded actions</small>
        </article>
      </div>

      <section className="panel supervision-form-panel">
        <div className="panel-heading">
          <div>
            <h3>Record a field visit</h3>
            <p>Each submission creates a separate supervision visit record.</p>
          </div>
          <span className="live-label">NEW VISIT</span>
        </div>

        <form onSubmit={submitVisit}>
          <div className="supervision-fields-grid">
            <label className="supervision-field">
              <span>Campaign name *</span>
              <input
                value={form.campaign}
                onChange={(event) => updateField("campaign", event.target.value)}
                placeholder="Enter campaign name"
                required
              />
            </label>

            <label className="supervision-field">
              <span>Linked operational task *</span>
              <input
                value={form.task}
                onChange={(event) => updateField("task", event.target.value)}
                placeholder="Enter or select task reference"
                required
              />
              <small>Task-library linking will be connected to the database.</small>
            </label>

            <label className="supervision-field">
              <span>Ward *</span>
              <input
                value={form.ward}
                onChange={(event) => updateField("ward", event.target.value)}
                placeholder="Enter ward"
                required
              />
            </label>

            <label className="supervision-field">
              <span>Settlement *</span>
              <input
                value={form.settlement}
                onChange={(event) => updateField("settlement", event.target.value)}
                placeholder="Enter settlement"
                required
              />
            </label>

            <label className="supervision-field">
              <span>Team code *</span>
              <input
                value={form.teamCode}
                onChange={(event) => updateField("teamCode", event.target.value)}
                placeholder="Enter team code"
                required
              />
            </label>

            <div className="supervision-field">
              <span>Visit location</span>
              <div className="supervision-location-box">
                {location ? (
                  <>
                    <strong>Location captured</strong>
                    <small>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</small>
                    <small>Accuracy: {Math.round(location.accuracy)} metres</small>
                  </>
                ) : (
                  <small>GPS location has not been captured.</small>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={captureLocation}
                  disabled={capturing}
                >
                  {capturing ? "Capturing..." : location ? "Refresh GPS" : "Capture GPS"}
                </button>
              </div>
            </div>

            <label className="supervision-field supervision-field-wide">
              <span>Supervision observations *</span>
              <textarea
                rows={4}
                value={form.observations}
                onChange={(event) => updateField("observations", event.target.value)}
                placeholder="Record observations, findings, team performance and issues observed..."
                required
              />
            </label>

            <label className="supervision-field supervision-field-wide">
              <span>Follow-up actions required</span>
              <textarea
                rows={3}
                value={form.followUp}
                onChange={(event) => updateField("followUp", event.target.value)}
                placeholder="Record corrective actions, responsible persons or support required..."
              />
            </label>

            <div className="supervision-field supervision-field-wide">
              <span>Visit evidence</span>
              <div className="supervision-evidence-box">
                <p>Select one or more photos as evidence references.</p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    addEvidence(event.target.files);
                    event.target.value = "";
                  }}
                />

                {evidence.length > 0 && (
                  <div className="supervision-evidence-list">
                    {evidence.map((name, index) => (
                      <div key={`${name}-${index}`}>
                        <span>{name}</span>
                        <button type="button" onClick={() => removeEvidence(index)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <small>Demo mode records filenames only. Actual image upload and secure storage are not connected.</small>
              </div>
            </div>
          </div>

          <button className="primary-button" type="submit">
            Save supervision visit →
          </button>
        </form>
      </section>

      <section className="panel supervision-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Supervision visit history</h3>
            <p>Each visit is retained as a separate record in this session.</p>
          </div>
          <span className="live-label">{visits.length} VISITS</span>
        </div>

        {visits.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">◎</div>
            <strong>No supervision visits recorded</strong>
            <p>Completed field visits will appear here.</p>
          </div>
        ) : (
          visits.map((visit) => (
            <article className="supervision-history-card" key={visit.id}>
              <div className="supervision-history-header">
                <div>
                  <strong>{visit.campaign}</strong>
                  <span>{visit.date}</span>
                </div>
                <span className="plan-status plan-status-ongoing">{visit.teamCode}</span>
              </div>

              <div className="supervision-history-details">
                <div><span>Task</span><strong>{visit.task}</strong></div>
                <div><span>Ward</span><strong>{visit.ward}</strong></div>
                <div><span>Settlement</span><strong>{visit.settlement}</strong></div>
              </div>

              <p className="supervision-observation-text">{visit.observations}</p>

              {visit.latitude !== null && visit.longitude !== null && (
                <div className="supervision-gps-reference">
                  GPS: {visit.latitude.toFixed(6)}, {visit.longitude.toFixed(6)}
                  {" "}· Accuracy: {Math.round(visit.accuracy ?? 0)}m
                </div>
              )}

              {visit.followUp && (
                <div className="supervision-followup">
                  <strong>Follow-up required</strong>
                  <p>{visit.followUp}</p>
                </div>
              )}

              {visit.evidence.length > 0 && (
                <div className="supervision-history-evidence">
                  <strong>Evidence references ({visit.evidence.length})</strong>
                  <ul>
                    {visit.evidence.map((name, index) => (
                      <li key={`${name}-${index}`}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Field evidence and privacy</strong>
        <p>Location is captured only when requested. This interface does not implement background tracking or facial recognition. Evidence filenames are temporary references only; secure upload, access controls and retention rules will be implemented before production use.</p>
      </div>
    </div>
  );
}
