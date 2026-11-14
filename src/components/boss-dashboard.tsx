"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BossView = "overview" | "comparisons" | "archive";
type LgaRow = { state_name: string; lga_id: string; lga_name: string; task_total: number; task_completed: number; working_days_approved: number; campaign_checkins: number; readiness_reports: number };
type ArchiveRow = { report_id: string; state_name: string; lga_name: string | null; report_type: string; period_start: string; period_end: string; status: string; created_at: string; reviewed_at: string | null; content: Record<string, unknown> };
const titles: Record<BossView, string> = { overview: "Executive Dashboard", comparisons: "LGA Comparisons", archive: "Report Archive" };

export default function BossDashboard({ view = "overview" }: { view?: BossView }) {
  const [lgas, setLgas] = useState<LgaRow[]>([]);
  const [archive, setArchive] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<"task_completed" | "working_days_approved" | "campaign_checkins">("task_completed");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const db = createClient();
    const [comparisonResult, archiveResult] = await Promise.all([
      db.rpc("boss_lga_comparisons"),
      db.rpc("boss_report_archive"),
    ]);
    const failure = comparisonResult.error ?? archiveResult.error;
    if (failure) setError(failure.message);
    else { setLgas((comparisonResult.data ?? []) as LgaRow[]); setArchive((archiveResult.data ?? []) as ArchiveRow[]); }
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const ordered = useMemo(() => [...lgas].sort((a, b) => Number(b[sortBy]) - Number(a[sortBy])), [lgas, sortBy]);
  const totals = useMemo(() => lgas.reduce((sum, row) => ({ tasks: sum.tasks + Number(row.task_total), completed: sum.completed + Number(row.task_completed), workingDays: sum.workingDays + Number(row.working_days_approved), checkins: sum.checkins + Number(row.campaign_checkins), readiness: sum.readiness + Number(row.readiness_reports) }), { tasks: 0, completed: 0, workingDays: 0, checkins: 0, readiness: 0 }), [lgas]);
  const contentText = (content: Record<string, unknown>) => [content.achievements, content.challenges, content.recommendations].filter((item) => typeof item === "string" && item.trim()).join(" · ") || "Approved report content not recorded.";

  return <div className="boss-dashboard-module">
    <header className="boss-dashboard-header"><div><span className="eyebrow">EXECUTIVE VIEW · ALL AUTHORIZED STATES</span><h1>{titles[view]}</h1><p>Aggregated operational counts and approved report records.</p></div><span className="live-label">READ ONLY</span></header>
    <div className="panel-heading"><span>Reports from restricted reporting functions; no direct operational-table access.</span><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
    {error && <section className="panel" role="alert"><h2>Executive reporting is unavailable</h2><p>{error}</p><p>Confirm the reviewed reporting contract is installed in the isolated database and that this account has the Boss role.</p></section>}
    {loading ? <section className="panel plan-empty">Loading secure reporting results…</section> : !error && (view === "overview" ? <>
      <div className="boss-dashboard-summary"><article className="panel"><span>LGAs represented</span><strong>{lgas.length}</strong></article><article className="panel"><span>Tasks completed</span><strong>{totals.completed} / {totals.tasks}</strong></article><article className="panel"><span>Approved working days</span><strong>{totals.workingDays}</strong></article><article className="panel"><span>Campaign records</span><strong>{totals.checkins + totals.readiness}</strong></article></div>
      <section className="panel"><div className="panel-heading"><div><h2>State coverage</h2><p>Counts are derived from operational database rows.</p></div></div>{lgas.length === 0 ? <div className="plan-empty">No aggregate rows were returned.</div> : <div className="boss-report-list">{Object.entries(lgas.reduce<Record<string, number>>((acc, item) => { acc[item.state_name] = (acc[item.state_name] ?? 0) + 1; return acc; }, {})).map(([state, count]) => <article key={state}><strong>{state}</strong><span>{count} LGAs represented</span></article>)}</div>}</section>
    </> : view === "comparisons" ? <section className="panel"><div className="panel-heading"><div><h2>LGA operational comparisons</h2><p>Counts only; no individual operational or personal records are exposed.</p></div><label>Sort by <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="task_completed">Tasks completed</option><option value="working_days_approved">Approved working days</option><option value="campaign_checkins">Campaign check-ins</option></select></label></div>{lgas.length === 0 ? <div className="plan-empty">No comparison rows were returned.</div> : <div className="campaign-monitoring-table-wrap"><table className="campaign-monitoring-table"><thead><tr><th>State</th><th>LGA</th><th>Tasks complete / total</th><th>Approved working days</th><th>Check-ins</th><th>Readiness reports</th></tr></thead><tbody>{ordered.map((row) => <tr key={row.lga_id}><td>{row.state_name}</td><td><strong>{row.lga_name}</strong></td><td>{row.task_completed} / {row.task_total}</td><td>{row.working_days_approved}</td><td>{row.campaign_checkins}</td><td>{row.readiness_reports}</td></tr>)}</tbody></table></div>}</section> : <section className="panel"><div className="panel-heading"><div><h2>Approved report archive</h2><p>Only reports with an approved status are returned.</p></div></div>{archive.length === 0 ? <div className="plan-empty">No approved reports are available.</div> : <div className="boss-report-list">{archive.map((report) => <article key={report.report_id}><div><strong>{report.state_name}{report.lga_name ? ` · ${report.lga_name}` : ""} — {report.report_type.replaceAll("_", " ")}</strong><span>Period: {report.period_start} to {report.period_end}</span><span>Reviewed: {report.reviewed_at ? new Date(report.reviewed_at).toLocaleString() : "—"}</span><p>{contentText(report.content ?? {})}</p></div><span className="status-badge approved">{report.status}</span></article>)}</div>}</section>)}
    <div className="plans-notice"><strong>Access boundary:</strong> This view uses Boss-only reporting RPCs. It does not grant direct access to reports, tasks, working-day records or campaign tables. Results are unavailable until those functions are installed and verified in the isolated test environment.</div>
  </div>;
}
