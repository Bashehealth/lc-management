"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Lga = { id: string; name: string };
type Checkin = { id: string; lga_id: string; checkin_date: string; checked_in_at: string; accuracy_meters: number | null; reported_location: string | null };
type Readiness = { id: string; lga_id: string; report_date: string; reporting_period: "morning" | "evening"; total_teams: number; gts_clear_reinstall_total: number; gts_pending: number; fionet_installed_total: number; fionet_pending: number; submitted_at: string };
type Device = { id: string; lga_id: string; activity_category: string; device_name: string; expected_quantity: number; completed_quantity: number; pending_quantity: number; blockers: string | null; reported_at: string };
type Visit = { id: string; lga_id: string; campaign_name: string; ward: string; settlement: string; team_code: string; visited_at: string; observations: string };
type Review = { id: string; visit_id: string; lga_id: string; review_status: string; review_note: string; reviewed_at: string };
type Tab = "Check-ins" | "Readiness" | "Devices" | "Supervision";

export default function CampaignMonitoring({ userId, role }: { userId: string; role: "state_coordinator" | "senior_supervisor" }) {
  const [tab, setTab] = useState<Tab>("Check-ins");
  const [lgas, setLgas] = useState<Lga[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Record<string, Review["review_status"]>>({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const db = createClient();
    const { data: profile, error: profileError } = await db.from("profiles").select("state_id").eq("id", userId).single();
    if (profileError || !profile?.state_id) { setError(profileError?.message ?? "Your supervisor account has no assigned state."); setLoading(false); return; }
    const { data: lgaData, error: lgaError } = await db.from("lgas").select("id,name").eq("state_id", profile.state_id).order("name");
    if (lgaError) { setError(lgaError.message); setLoading(false); return; }
    const rows = (lgaData ?? []) as Lga[]; setLgas(rows);
    const ids = rows.map((lga) => lga.id);
    if (ids.length === 0) { setCheckins([]); setReadiness([]); setDevices([]); setVisits([]); setReviews([]); setLoading(false); return; }
    const [checkinResult, readinessResult, deviceResult, visitResult, reviewResult] = await Promise.all([
      db.from("campaign_checkins").select("id,lga_id,checkin_date,checked_in_at,accuracy_meters,reported_location").in("lga_id", ids).order("checked_in_at", { ascending: false }).limit(500),
      db.from("campaign_readiness_reports").select("id,lga_id,report_date,reporting_period,total_teams,gts_clear_reinstall_total,gts_pending,fionet_installed_total,fionet_pending,submitted_at").in("lga_id", ids).order("report_date", { ascending: false }).limit(500),
      db.from("campaign_device_progress").select("id,lga_id,activity_category,device_name,expected_quantity,completed_quantity,pending_quantity,blockers,reported_at").in("lga_id", ids).order("reported_at", { ascending: false }).limit(500),
      db.from("supportive_supervision_visits").select("id,lga_id,campaign_name,ward,settlement,team_code,visited_at,observations").in("lga_id", ids).order("visited_at", { ascending: false }).limit(500),
      db.from("supportive_supervision_reviews").select("id,visit_id,lga_id,review_status,review_note,reviewed_at").in("lga_id", ids).order("reviewed_at", { ascending: false }).limit(500),
    ]);
    const failure = checkinResult.error ?? readinessResult.error ?? deviceResult.error ?? visitResult.error ?? reviewResult.error;
    if (failure) setError(failure.message);
    else { setCheckins((checkinResult.data ?? []) as Checkin[]); setReadiness((readinessResult.data ?? []) as Readiness[]); setDevices((deviceResult.data ?? []) as Device[]); setVisits((visitResult.data ?? []) as Visit[]); setReviews((reviewResult.data ?? []) as Review[]); }
    setLoading(false);
  }, [userId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const lgaName = (id: string) => lgas.find((lga) => lga.id === id)?.name ?? "Unknown LGA";
  const visible = (id: string) => filter === "all" || id === filter;
  async function recordReview(visit: Visit) {
    const note = (notes[visit.id] ?? "").trim();
    if (!note) { setNotice("Enter a review note before saving."); return; }
    if (saving) return;
    setSaving(visit.id); setError(""); setNotice("");
    const { error: insertError } = await createClient().from("supportive_supervision_reviews").insert({ visit_id: visit.id, lga_id: visit.lga_id, reviewer_id: userId, review_status: decision[visit.id] ?? "accepted", review_note: note });
    if (insertError) setError(insertError.message); else { setNotes((current) => ({ ...current, [visit.id]: "" })); setNotice("Review note saved to history."); await load(); }
    setSaving(null);
  }
  const latestReview = (visitId: string) => reviews.find((item) => item.visit_id === visitId);

  return <div className="campaign-monitoring-module">
    {(error || notice) && <div className="plans-notice"><span role={error ? "alert" : "status"}>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
    <header className="campaign-monitoring-header"><div><span className="eyebrow">STATE OPERATIONS</span><h1>Campaign Monitoring</h1><p>Operational records and saved supervision reviews for your assigned state.</p></div><span className="live-label">LIVE RECORDS · {role === "state_coordinator" ? "SC" : "SENIOR SUPERVISOR"}</span></header>
    <div className="campaign-monitoring-summary"><article className="panel"><span>LGAs in assigned state</span><strong>{loading ? "…" : lgas.length}</strong></article><article className="panel"><span>Check-ins loaded</span><strong>{checkins.length}</strong></article><article className="panel"><span>Readiness submissions</span><strong>{readiness.length}</strong></article><article className="panel"><span>Saved visit reviews</span><strong>{reviews.length}</strong></article></div>
    <nav className="campaign-monitoring-tabs" aria-label="Campaign monitoring sections">{(["Check-ins", "Readiness", "Devices", "Supervision"] as Tab[]).map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <section className="panel"><div className="panel-heading"><div><h2>{tab}</h2><p>Records are filtered to LGAs assigned to your state.</p></div><div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All assigned LGAs</option>{lgas.map((lga) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}</select> <button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div></div>
      {loading ? <div className="plan-empty">Loading state campaign records…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : tab === "Check-ins" ? checkins.filter((row) => visible(row.lga_id)).length === 0 ? <div className="plan-empty">No check-in records found for this state.</div> : <div className="campaign-monitoring-table-wrap"><table className="campaign-monitoring-table"><thead><tr><th>LGA</th><th>Date</th><th>Submitted</th><th>Reported location</th><th>Accuracy</th></tr></thead><tbody>{checkins.filter((row) => visible(row.lga_id)).map((row) => <tr key={row.id}><td>{lgaName(row.lga_id)}</td><td>{row.checkin_date}</td><td>{new Date(row.checked_in_at).toLocaleString()}</td><td>{row.reported_location || "Coordinates recorded"}</td><td>{row.accuracy_meters == null ? "—" : `${Math.round(row.accuracy_meters)} m`}</td></tr>)}</tbody></table></div> : tab === "Readiness" ? readiness.filter((row) => visible(row.lga_id)).length === 0 ? <div className="plan-empty">No readiness reports found for this state.</div> : <div className="campaign-monitoring-table-wrap"><table className="campaign-monitoring-table"><thead><tr><th>LGA</th><th>Date / period</th><th>Teams</th><th>GTS complete / pending</th><th>FIONET installed / pending</th></tr></thead><tbody>{readiness.filter((row) => visible(row.lga_id)).map((row) => <tr key={row.id}><td>{lgaName(row.lga_id)}</td><td>{row.report_date} · {row.reporting_period}</td><td>{row.total_teams}</td><td>{row.gts_clear_reinstall_total} / {row.gts_pending}</td><td>{row.fionet_installed_total} / {row.fionet_pending}</td></tr>)}</tbody></table></div> : tab === "Devices" ? devices.filter((row) => visible(row.lga_id)).length === 0 ? <div className="plan-empty">No device progress reports found.</div> : <div className="campaign-monitoring-table-wrap"><table className="campaign-monitoring-table"><thead><tr><th>LGA</th><th>Reported</th><th>Device / activity</th><th>Completed / expected</th><th>Blockers</th></tr></thead><tbody>{devices.filter((row) => visible(row.lga_id)).map((row) => <tr key={row.id}><td>{lgaName(row.lga_id)}</td><td>{new Date(row.reported_at).toLocaleDateString()}</td><td>{row.device_name} · {row.activity_category}</td><td>{row.completed_quantity} / {row.expected_quantity}</td><td>{row.blockers || "None recorded"}</td></tr>)}</tbody></table></div> : visits.filter((row) => visible(row.lga_id)).length === 0 ? <div className="plan-empty">No supervision visits found for this state.</div> : <div className="campaign-monitoring-table-wrap"><table className="campaign-monitoring-table"><thead><tr><th>LGA / team</th><th>Visit</th><th>Ward / settlement</th><th>Review note</th></tr></thead><tbody>{visits.filter((row) => visible(row.lga_id)).map((visit) => <tr key={visit.id}><td><strong>{lgaName(visit.lga_id)}</strong><small>{visit.team_code}</small></td><td>{visit.campaign_name}<small>{new Date(visit.visited_at).toLocaleString()}</small></td><td>{visit.ward} / {visit.settlement}</td><td>{latestReview(visit.id) ? <><strong>{latestReview(visit.id)?.review_status.replaceAll("_", " ")}</strong><small>{latestReview(visit.id)?.review_note}</small></> : <><select aria-label="Review decision" value={decision[visit.id] ?? "accepted"} onChange={(event) => setDecision((current) => ({ ...current, [visit.id]: event.target.value as Review["review_status"] }))}><option value="accepted">Accepted</option><option value="needs_follow_up">Needs follow-up</option><option value="returned_for_revision">Return for revision</option></select><textarea aria-label="Review note" value={notes[visit.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [visit.id]: event.target.value }))} placeholder="Required review note" /><button type="button" className="secondary-button" onClick={() => void recordReview(visit)} disabled={saving === visit.id}>{saving === visit.id ? "Saving…" : "Save review"}</button></>}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="campaign-monitoring-note">Review actions are saved to append-only supervision review history. All reads and writes require state-scoped RLS from the approved security foundation.</div>
  </div>;
}
