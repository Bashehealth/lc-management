"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VisitRecord = {
  id: string; campaign_name: string; task_id: string | null; ward: string; settlement: string; team_code: string;
  visited_at: string; latitude: number; longitude: number; accuracy_meters: number | null; observations: string;
};
type TaskOption = { id: string; title: string };
const initialForm = { campaign: "", taskId: "", ward: "", settlement: "", teamCode: "", observations: "", followUp: "" };

export default function SupportiveSupervision({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const [form, setForm] = useState(initialForm);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!lgaId) { setError("Your account is not assigned to an LGA."); setLoading(false); return; }
    setLoading(true); setError("");
    const db = createClient();
    const [visitsResult, tasksResult] = await Promise.all([
      db.from("supportive_supervision_visits").select("id,campaign_name,task_id,ward,settlement,team_code,visited_at,latitude,longitude,accuracy_meters,observations").eq("lga_id", lgaId).order("visited_at", { ascending: false }).limit(100),
      db.from("tasks").select("id,title").eq("lga_id", lgaId).order("title"),
    ]);
    const failure = visitsResult.error ?? tasksResult.error;
    if (failure) setError(failure.message);
    else { setVisits((visitsResult.data ?? []) as VisitRecord[]); setTasks((tasksResult.data ?? []) as TaskOption[]); }
    setLoading(false);
  }, [lgaId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  function updateField(field: keyof typeof initialForm, value: string) { setForm((previous) => ({ ...previous, [field]: value })); }
  function captureLocation() {
    if (!navigator.geolocation) { setNotice("Geolocation is not supported by this browser."); return; }
    setCapturing(true); setNotice("Requesting current location...");
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
      setCapturing(false); setNotice("Visit location captured.");
    }, (geoError) => {
      setCapturing(false);
      setNotice(geoError.code === geoError.PERMISSION_DENIED ? "Location permission denied. Allow location access and try again." : geoError.code === geoError.TIMEOUT ? "Location request timed out. Try again." : "Unable to capture location.");
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function submitVisit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lgaId || !userId || !location) { setNotice("Capture GPS and confirm your assigned LGA before submitting."); return; }
    if (!form.taskId) { setNotice("Select an existing LGA task to link this visit."); return; }
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    const observations = form.followUp.trim() ? `${form.observations.trim()}\n\nFollow-up required: ${form.followUp.trim()}` : form.observations.trim();
    const { error: insertError } = await createClient().from("supportive_supervision_visits").insert({
      lga_id: lgaId, submitted_by: userId, task_id: form.taskId, campaign_name: form.campaign.trim(), ward: form.ward.trim(),
      settlement: form.settlement.trim(), team_code: form.teamCode.trim(), visited_at: new Date().toISOString(),
      latitude: location.latitude, longitude: location.longitude, accuracy_meters: location.accuracy, observations,
    });
    if (insertError) setError(insertError.message);
    else { setForm(initialForm); setLocation(null); setNotice("Supervision visit saved."); await load(); }
    setSaving(false);
  }

  return (
    <div className="supervision-module">
      {(notice || error) && <div className="plans-notice"><span role={error ? "alert" : "status"}>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <div className="supervision-heading"><div><span className="eyebrow">ASSIGNED LGA</span><h2>Supportive Supervision</h2><p>Record field supervision visits linked to campaign tasks.</p></div><span className="live-label">LGA VISITS</span></div>
      <div className="supervision-summary-grid">
        <article className="plan-summary-card"><span>Total visits</span><strong>{loading ? "…" : visits.length}</strong><small>Saved records</small></article>
        <article className="plan-summary-card"><span>GPS captured</span><strong>{visits.length}</strong><small>Required on saved visits</small></article>
        <article className="plan-summary-card"><span>Follow-up required</span><strong>{visits.filter((visit) => visit.observations.includes("Follow-up required:")).length}</strong><small>Saved action notes</small></article>
        <article className="plan-summary-card"><span>Available tasks</span><strong>{tasks.length}</strong><small>In this LGA</small></article>
      </div>
      <section className="panel supervision-form-panel">
        <div className="panel-heading"><div><h3>Record a field visit</h3><p>Visit records require an existing task and captured GPS coordinates.</p></div><span className="live-label">NEW VISIT</span></div>
        {tasks.length === 0 && !loading ? <div className="plan-empty">No LGA tasks are available to link to a visit.</div> : <form onSubmit={submitVisit}>
          <div className="supervision-fields-grid">
            <label className="supervision-field"><span>Campaign name *</span><input value={form.campaign} onChange={(event) => updateField("campaign", event.target.value)} required /></label>
            <label className="supervision-field"><span>Linked operational task *</span><select value={form.taskId} onChange={(event) => updateField("taskId", event.target.value)} required><option value="">Select an LGA task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
            <label className="supervision-field"><span>Ward *</span><input value={form.ward} onChange={(event) => updateField("ward", event.target.value)} required /></label>
            <label className="supervision-field"><span>Settlement *</span><input value={form.settlement} onChange={(event) => updateField("settlement", event.target.value)} required /></label>
            <label className="supervision-field"><span>Team code *</span><input value={form.teamCode} onChange={(event) => updateField("teamCode", event.target.value)} required /></label>
            <div className="supervision-field"><span>Visit location *</span><div className="supervision-location-box">{location ? <><strong>Location captured</strong><small>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</small><small>Accuracy: {Math.round(location.accuracy)} metres</small></> : <small>GPS location has not been captured.</small>}<button type="button" className="secondary-button" onClick={captureLocation} disabled={capturing}>{capturing ? "Capturing…" : location ? "Refresh GPS" : "Capture GPS"}</button></div></div>
            <label className="supervision-field supervision-field-wide"><span>Supervision observations *</span><textarea rows={4} value={form.observations} onChange={(event) => updateField("observations", event.target.value)} required /></label>
            <label className="supervision-field supervision-field-wide"><span>Follow-up actions required</span><textarea rows={3} value={form.followUp} onChange={(event) => updateField("followUp", event.target.value)} /></label>
            <div className="supervision-field supervision-field-wide"><span>Visit evidence</span><small>Secure storage is not configured. No files are uploaded or attached to this visit.</small></div>
          </div>
          <button className="primary-button" type="submit" disabled={saving || loading || !lgaId || !location}>{saving ? "Saving…" : "Save supervision visit →"}</button>
        </form>}
      </section>
      <section className="panel supervision-history-panel">
        <div className="panel-heading"><div><h3>Supervision visit history</h3><p>Saved records for this LGA</p></div><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
        {loading ? <div className="plan-empty">Loading visits…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : visits.length === 0 ? <div className="plan-empty"><div className="working-empty-icon">◎</div><strong>No supervision visits recorded</strong><p>Saved field visits will appear here.</p></div> : visits.map((visit) => (
          <article className="supervision-history-card" key={visit.id}><div className="supervision-history-header"><div><strong>{visit.campaign_name}</strong><span>{new Date(visit.visited_at).toLocaleString()}</span></div><span className="plan-status plan-status-ongoing">{visit.team_code}</span></div><div className="supervision-history-details"><div><span>Task</span><strong>{tasks.find((task) => task.id === visit.task_id)?.title ?? "Task reference unavailable"}</strong></div><div><span>Ward</span><strong>{visit.ward}</strong></div><div><span>Settlement</span><strong>{visit.settlement}</strong></div></div><p className="supervision-observation-text">{visit.observations}</p><div className="supervision-gps-reference">GPS: {visit.latitude.toFixed(6)}, {visit.longitude.toFixed(6)} · Accuracy: {Math.round(visit.accuracy_meters ?? 0)}m</div></article>
        ))}
      </section>
      <div className="checkin-privacy-note"><strong>Field evidence and privacy</strong><p>Location is captured only when requested. No background tracking is used. File upload remains unavailable until secure storage is configured.</p></div>
    </div>
  );
}
