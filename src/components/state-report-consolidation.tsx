"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "state_coordinator" | "senior_supervisor";
type Lga = { id: string; name: string };
type Report = { id: string; lga_id: string | null; state_id: string | null; report_type: string; period_start: string; period_end: string; status: string; created_by: string; content: Record<string, unknown>; feedback: string | null; created_at: string };
type Task = { lga_id: string; status: string; deadline: string | null; created_at: string; completed_at: string | null };
type WorkingDay = { lga_id: string; status: string; working_date: string };
type Checkin = { lga_id: string; checkin_date: string };
type Readiness = { lga_id: string; report_date: string; total_teams: number };

export default function StateReportConsolidation({ userId, role }: { userId: string; role: Role }) {
  const [stateId, setStateId] = useState("");
  const [lgas, setLgas] = useState<Lga[]>([]);
  const [lgaReports, setLgaReports] = useState<Report[]>([]);
  const [stateReports, setStateReports] = useState<Report[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [summary, setSummary] = useState("");
  const [achievements, setAchievements] = useState("");
  const [challenges, setChallenges] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const db = createClient();
    const { data: profile, error: profileError } = await db.from("profiles").select("state_id").eq("id", userId).single();
    if (profileError || !profile?.state_id) { setError(profileError?.message ?? "Your account has no assigned state."); setLoading(false); return; }
    setStateId(profile.state_id);
    const { data: lgaData, error: lgaError } = await db.from("lgas").select("id,name").eq("state_id", profile.state_id).order("name");
    if (lgaError) { setError(lgaError.message); setLoading(false); return; }
    const lgaRows = (lgaData ?? []) as Lga[]; setLgas(lgaRows);
    const ids = lgaRows.map((lga) => lga.id);
    const requests = await Promise.all([
      ids.length ? db.from("reports").select("id,lga_id,state_id,report_type,period_start,period_end,status,created_by,content,feedback,created_at").in("lga_id", ids).eq("report_type", "lga_monthly").order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
      db.from("reports").select("id,lga_id,state_id,report_type,period_start,period_end,status,created_by,content,feedback,created_at").eq("state_id", profile.state_id).in("report_type", ["state_monthly", "consolidated_monthly"]).order("created_at", { ascending: false }).limit(500),
      ids.length ? db.from("tasks").select("lga_id,status,deadline,created_at,completed_at").in("lga_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from("working_day_records").select("lga_id,status,working_date").in("lga_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from("campaign_checkins").select("lga_id,checkin_date").in("lga_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from("campaign_readiness_reports").select("lga_id,report_date,total_teams").in("lga_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    const failure = requests.find((item) => item.error)?.error;
    if (failure) setError(failure.message);
    else {
      setLgaReports((requests[0].data ?? []) as Report[]); setStateReports((requests[1].data ?? []) as Report[]);
      setTasks((requests[2].data ?? []) as Task[]); setWorkingDays((requests[3].data ?? []) as WorkingDay[]);
      setCheckins((requests[4].data ?? []) as Checkin[]); setReadiness((requests[5].data ?? []) as Readiness[]);
    }
    setLoading(false);
  }, [userId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const inPeriod = useCallback((date: string | null | undefined) => Boolean(date && (!periodStart || date >= periodStart) && (!periodEnd || date <= periodEnd)), [periodStart, periodEnd]);
  const periodTasks = tasks.filter((row) => inPeriod(row.created_at));
  const metrics = useMemo(() => ({
    lgas: lgas.length, tasks: periodTasks.length,
    completed: tasks.filter((row) => row.status === "completed" && inPeriod(row.completed_at)).length,
    overdue: periodTasks.filter((row) => row.deadline && row.deadline < (periodEnd || new Date().toISOString().slice(0, 10)) && row.status !== "completed").length,
    approvedWorkingDays: workingDays.filter((row) => row.status === "approved" && inPeriod(row.working_date)).length,
    campaignCheckins: checkins.filter((row) => inPeriod(row.checkin_date)).length,
    readinessSubmissions: readiness.filter((row) => inPeriod(row.report_date)).length,
  }), [lgas, periodTasks, tasks, workingDays, checkins, readiness, periodEnd, inPeriod]);

  async function reviewReport(report: Report, decision: "approved" | "returned") {
    const note = (notes[report.id] ?? "").trim();
    if (!note) { setNotice("A review note is required for every decision."); return; }
    if (saving) return;
    setSaving(report.id); setError(""); setNotice("");
    const { data, error: updateError } = await createClient().from("reports").update({ status: decision, reviewed_by: userId, reviewed_at: new Date().toISOString(), feedback: note }).eq("id", report.id).eq("status", "submitted").select("id").maybeSingle();
    if (updateError) setError(updateError.message); else if (!data) setError("This report is no longer awaiting review."); else { setNotice(`Report ${decision}.`); setNotes((current) => ({ ...current, [report.id]: "" })); await load(); }
    setSaving("");
  }

  async function saveReport(status: "draft" | "submitted") {
    if (!periodStart || !periodEnd || periodEnd < periodStart) { setNotice("Enter a valid reporting period."); return; }
    if (!summary.trim() || !achievements.trim()) { setNotice("Add the summary and achievements before saving the report."); return; }
    if (role === "senior_supervisor" && approvedStateReports.length === 0) { setNotice("No approved State Coordinator reports exist in this period to consolidate."); return; }
    if (saving) return;
    setSaving("new"); setError(""); setNotice("");
    const reportType = role === "state_coordinator" ? "state_monthly" : "consolidated_monthly";
    const sourceReports = approvedStateReports;
    const content = { summary: summary.trim(), achievements: achievements.trim(), challenges: challenges.trim(), recommendations: recommendations.trim(), source_metrics: metrics, source_report_ids: role === "senior_supervisor" ? sourceReports.map((item) => item.id) : [] };
    const db = createClient();
    const { data, error: insertError } = await db.from("reports").insert({ lga_id: null, state_id: stateId, report_type: reportType, period_start: periodStart, period_end: periodEnd, status: "draft", created_by: userId, content }).select("id").single();
    if (insertError) setError(insertError.message);
    else if (status === "submitted") {
      const { error: submitError } = await db.from("reports").update({ status: "submitted" }).eq("id", data.id).eq("status", "draft");
      if (submitError) setError(`Draft saved, but submission failed: ${submitError.message}`);
      else setNotice("Report submitted to the next review stage.");
      await load();
    } else { setNotice("Draft saved."); await load(); }
    setSaving("");
  }

  const awaitingReview = role === "state_coordinator" ? lgaReports.filter((item) => item.status === "submitted") : stateReports.filter((item) => item.report_type === "state_monthly" && item.status === "submitted");
  const approvedStateReports = stateReports.filter((item) => item.report_type === "state_monthly" && item.status === "approved" && (!periodStart || item.period_start >= periodStart) && (!periodEnd || item.period_end <= periodEnd));
  const history = role === "state_coordinator" ? stateReports.filter((item) => item.report_type === "state_monthly") : stateReports.filter((item) => item.report_type === "consolidated_monthly");

  return <div className="state-report-module">
    {(error || notice) && <div className="plans-notice"><span role={error ? "alert" : "status"}>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
    <header className="state-report-header"><div><span className="eyebrow">ASSIGNED STATE · {role === "state_coordinator" ? "SC REPORTS" : "SENIOR SUPERVISOR"}</span><h1>{role === "state_coordinator" ? "State Reports" : "Report Consolidation"}</h1><p>{role === "state_coordinator" ? "Review LGA reports and submit a persistent state report." : "Review State Coordinator reports and submit the persistent consolidated report."}</p></div><span className="live-label">DATABASE WORKFLOW</span></header>
    <div className="state-report-summary"><article className="panel"><span>LGAs in assigned state</span><strong>{loading ? "…" : metrics.lgas}</strong></article><article className="panel"><span>Tasks completed</span><strong>{metrics.completed} / {metrics.tasks}</strong></article><article className="panel"><span>Approved working days</span><strong>{metrics.approvedWorkingDays}</strong></article><article className="panel"><span>Campaign records</span><strong>{metrics.campaignCheckins + metrics.readinessSubmissions}</strong></article></div>
    <section className="panel"><div className="panel-heading"><div><h2>{role === "state_coordinator" ? "LGA reports awaiting review" : "State reports awaiting review"}</h2><p>Only records in your assigned state are displayed.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
      {loading ? <div className="plan-empty">Loading reports…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : awaitingReview.length === 0 ? <div className="plan-empty">No submitted reports are awaiting review.</div> : awaitingReview.map((report) => <article className="state-report-history" key={report.id}><strong>{report.report_type.replaceAll("_", " ")} · {report.period_start} – {report.period_end}</strong><p>{String(report.content?.summary ?? "No summary provided")}</p><p><strong>Achievements:</strong> {String(report.content?.achievements ?? "—")}</p><p><strong>Challenges:</strong> {String(report.content?.challenges ?? "—")}</p><label>Required review note<textarea value={notes[report.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} /></label><div className="state-report-actions"><button className="secondary-button" onClick={() => void reviewReport(report, "returned")} disabled={saving === report.id}>Return with note</button><button className="primary-button" onClick={() => void reviewReport(report, "approved")} disabled={saving === report.id}>Approve with note</button></div></article>)}
    </section>
    {role === "senior_supervisor" && <section className="panel"><div className="panel-heading"><div><h2>Approved State Coordinator reports</h2><p>Only approved state report records are eligible for consolidation.</p></div></div>{stateReports.filter((item) => item.report_type === "state_monthly" && item.status === "approved").length === 0 ? <div className="plan-empty">No approved state reports are available to consolidate.</div> : stateReports.filter((item) => item.report_type === "state_monthly" && item.status === "approved").map((item) => <article className="state-report-history" key={item.id}><strong>{item.period_start} – {item.period_end}</strong><p>{String(item.content?.summary ?? "—")}</p><small>Report id: {item.id}</small></article>)}</section>}
    <section className="panel state-report-editor"><div className="panel-heading"><div><h2>{role === "state_coordinator" ? "Prepare statewide report" : "Prepare consolidated report"}</h2><p>Persisted operational counts are included with your narrative.</p></div></div>
      <div className="reports-fields-grid"><label className="reports-field"><span>Period start *</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label className="reports-field"><span>Period end *</span><input type="date" min={periodStart || undefined} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label className="reports-field reports-field-wide"><span>Executive summary *</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label className="reports-field reports-field-wide"><span>Achievements *</span><textarea value={achievements} onChange={(event) => setAchievements(event.target.value)} /></label><label className="reports-field reports-field-wide"><span>Challenges</span><textarea value={challenges} onChange={(event) => setChallenges(event.target.value)} /></label><label className="reports-field reports-field-wide"><span>Recommendations</span><textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} /></label></div>
      {role === "senior_supervisor" && <p className="campaign-monitoring-note">Approved State Coordinator sources in this period: {approvedStateReports.length}</p>}
      <div className="state-report-actions"><button className="secondary-button" onClick={() => void saveReport("draft")} disabled={loading || Boolean(saving) || !stateId || (role === "senior_supervisor" && approvedStateReports.length === 0)}>{saving === "new" ? "Saving…" : "Save draft"}</button><button className="primary-button" onClick={() => void saveReport("submitted")} disabled={loading || Boolean(saving) || !stateId || (role === "senior_supervisor" && approvedStateReports.length === 0)}>{saving === "new" ? "Saving…" : "Submit for review"}</button></div>
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Persistent report history</h2><p>State-scoped report records</p></div></div>{loading ? <div className="plan-empty">Loading history…</div> : history.length === 0 ? <div className="plan-empty">No reports have been created for this workflow.</div> : history.map((report) => <article className="state-report-history" key={report.id}><strong>{report.report_type.replaceAll("_", " ")} · {report.period_start} – {report.period_end}</strong><span className={`status-badge ${report.status === "approved" ? "approved" : report.status === "returned" ? "returned" : "pending"}`}>{report.status}</span><small>{new Date(report.created_at).toLocaleString()}</small>{report.feedback && <p>Reviewer note: {report.feedback}</p>}</article>)}</section>
    <div className="plans-notice"><strong>Workflow:</strong> State Coordinators review LGA submissions and submit state reports. Senior Supervisors review state reports and consolidate only approved submissions. A report author cannot approve their own submission under the proposed database trigger.</div>
  </div>;
}
