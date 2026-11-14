"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Report = { id: string; period_start: string; period_end: string; status: "draft" | "submitted" | "returned" | "approved" | "shared"; content: { cadence?: "Weekly" | "Monthly"; achievements?: string; challenges?: string; recommendations?: string }; feedback: string | null; created_at: string };
const emptyContent = { achievements: "", challenges: "", recommendations: "" };

export default function MyReports({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const [period, setPeriod] = useState<"Weekly" | "Monthly">("Weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [content, setContent] = useState(emptyContent);
  const [reports, setReports] = useState<Report[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!lgaId) { setError("Your account is not assigned to an LGA."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await createClient().from("reports").select("id,period_start,period_end,status,content,feedback,created_at").eq("lga_id", lgaId).eq("report_type", "lga_monthly").order("created_at", { ascending: false }).limit(100);
    if (queryError) setError(queryError.message); else setReports((data ?? []) as Report[]);
    setLoading(false);
  }, [lgaId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const submitted = reports.filter((report) => report.status !== "draft" && report.status !== "returned").length;
  const drafts = reports.filter((report) => report.status === "draft" || report.status === "returned").length;
  function updateContent(field: keyof typeof emptyContent, value: string) { setContent((current) => ({ ...current, [field]: value })); }
  function editReport(report: Report) {
    setEditingId(report.id); setStartDate(report.period_start); setEndDate(report.period_end);
    setContent({ ...emptyContent, ...report.content }); setPeriod(report.content.cadence ?? "Monthly"); setNotice("");
    document.querySelector(".reports-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function clearForm() { setEditingId(null); setStartDate(""); setEndDate(""); setContent(emptyContent); }

  async function saveReport(status: "draft" | "submitted") {
    if (!userId || !lgaId || !startDate || !endDate || endDate < startDate) { setNotice("Enter a valid reporting period. The end date cannot be before the start date."); return; }
    if (status === "submitted" && !content.achievements.trim()) { setNotice("Record at least one achievement before submitting the report."); return; }
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    const db = createClient();
    const values = { period_start: startDate, period_end: endDate, content: { ...content, cadence: period }, status };
    const result = editingId
      ? await db.from("reports").update(values).eq("id", editingId).eq("created_by", userId).select("id").maybeSingle()
      : await db.from("reports").insert({ ...values, lga_id: lgaId, state_id: null, report_type: "lga_monthly", created_by: userId }).select("id").single();
    if (result.error) setError(result.error.message);
    else if (!result.data) setError("The report was not updated. It may no longer be editable.");
    else { clearForm(); setNotice(status === "submitted" ? "Report submitted for supervisor review." : "Draft saved."); await load(); }
    setSaving(false);
  }

  return <div className="reports-module">
    {(notice || error) && <div className="plans-notice"><span role={error ? "alert" : "status"}>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
    <div className="reports-heading"><div><span className="eyebrow">ASSIGNED LGA</span><h2>My Reports</h2><p>Prepare, edit and submit weekly and monthly activity reports.</p></div><span className="live-label">SAVED REPORTS</span></div>
    <div className="reports-summary-grid"><article className="plan-summary-card"><span>Total reports</span><strong>{loading ? "…" : reports.length}</strong><small>Persistent records</small></article><article className="plan-summary-card"><span>Submitted / reviewed</span><strong>{submitted}</strong><small>Workflow records</small></article><article className="plan-summary-card"><span>Drafts / returned</span><strong>{drafts}</strong><small>Editable records</small></article><article className="plan-summary-card"><span>Reporting formats</span><strong>2</strong><small>Weekly and monthly</small></article></div>
    <section className="panel reports-form-panel"><div className="panel-heading"><div><h3>{editingId ? "Edit report" : "Prepare activity report"}</h3><p>Report content is stored with the report record.</p></div><span className="live-label">{editingId ? "EDITING" : "NEW REPORT"}</span></div>
      <div className="reports-period-selector"><button type="button" className={period === "Weekly" ? "reports-period-active" : ""} onClick={() => setPeriod("Weekly")}>Weekly Report</button><button type="button" className={period === "Monthly" ? "reports-period-active" : ""} onClick={() => setPeriod("Monthly")}>Monthly Report</button></div>
      <div className="reports-fields-grid"><label className="reports-field"><span>Reporting period start *</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label className="reports-field"><span>Reporting period end *</span><input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
        <label className="reports-field reports-field-wide"><span>Achievements and activities completed *</span><textarea rows={5} value={content.achievements} onChange={(event) => updateContent("achievements", event.target.value)} required /></label><label className="reports-field reports-field-wide"><span>Challenges and operational constraints</span><textarea rows={4} value={content.challenges} onChange={(event) => updateContent("challenges", event.target.value)} /></label><label className="reports-field reports-field-wide"><span>Recommendations</span><textarea rows={4} value={content.recommendations} onChange={(event) => updateContent("recommendations", event.target.value)} /></label>
      </div><div className="reports-form-actions"><button className="secondary-button" type="button" disabled={saving || loading || !lgaId} onClick={() => void saveReport("draft")}>{saving ? "Saving…" : "Save draft"}</button><button className="primary-button" type="button" disabled={saving || loading || !lgaId} onClick={() => void saveReport("submitted")}>{saving ? "Saving…" : "Submit report →"}</button>{editingId && <button className="secondary-button" type="button" onClick={clearForm}>Cancel edit</button>}</div>
    </section>
    <section className="panel"><div className="panel-heading"><div><h3>Report history</h3><p>Persistent submissions and review feedback</p></div><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
      {loading ? <div className="plan-empty">Loading reports…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : reports.length === 0 ? <div className="plan-empty">No reports found for this LGA.</div> : reports.map((report) => <article className="reports-history-row" key={report.id}><div><strong>{report.period_start} to {report.period_end}</strong><span>{new Date(report.created_at).toLocaleString()}</span></div><span className={`status-badge ${report.status === "approved" ? "approved" : report.status === "returned" ? "returned" : "pending"}`}>{report.status}</span><div className="reports-history-content"><p><strong>Achievements:</strong> {report.content?.achievements || "—"}</p><p><strong>Challenges:</strong> {report.content?.challenges || "—"}</p><p><strong>Recommendations:</strong> {report.content?.recommendations || "—"}</p>{report.feedback && <p><strong>Reviewer feedback:</strong> {report.feedback}</p>}</div>{(report.status === "draft" || report.status === "returned") && <button type="button" className="secondary-button" onClick={() => editReport(report)}>Edit</button>}</article>)}
    </section>
    <div className="checkin-privacy-note"><strong>Report lifecycle</strong><p>Drafts can be edited. Submitted reports are reviewed by the authorized State Coordinator or Senior Supervisor and become read-only after a final decision.</p></div>
  </div>;
}
