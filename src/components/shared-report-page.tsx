"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SharedReport = { report_type: string; state_name: string | null; lga_name: string | null; period_start: string; period_end: string; approved_at: string | null; content: Record<string, unknown> };

export default function SharedReportPage() {
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => {
      const token = window.location.hash.slice(1);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (!/^[0-9a-f]{64}$/.test(token)) { setInvalid(true); setLoading(false); return; }
      void createClient().rpc("get_shared_report", { target_token: token }).then(({ data, error }) => {
        if (!mounted) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) setInvalid(true); else setReport(row as SharedReport);
        setLoading(false);
      });
    }, 0);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, []);

  const contentValue = (key: string) => typeof report?.content?.[key] === "string" ? report.content[key] as string : "Not provided.";
  return <main className="shared-report-page"><header><span className="eyebrow">SECURE REPORT ACCESS</span><h1>Shared operational report</h1><p>Read-only access to an approved report.</p></header>
    {loading ? <section className="panel">Validating secure share…</section> : invalid || !report ? <section className="panel" role="alert"><h2>This share is unavailable</h2><p>The token may be invalid, expired, or revoked. Ask the report owner for a new share.</p></section> : <article className="panel"><div className="panel-heading"><div><span className="status-badge approved">Approved</span><h2>{report.report_type.replaceAll("_", " ")}</h2><p>{report.state_name ?? "State not recorded"}{report.lga_name ? ` · ${report.lga_name}` : ""}</p><p>{report.period_start} to {report.period_end}</p></div></div><section><h3>Executive summary</h3><p>{contentValue("summary")}</p><h3>Achievements</h3><p>{contentValue("achievements")}</p><h3>Challenges</h3><p>{contentValue("challenges")}</p><h3>Recommendations</h3><p>{contentValue("recommendations")}</p></section><small>Approved {report.approved_at ? new Date(report.approved_at).toLocaleString() : "date unavailable"}. This view is read-only.</small></article>}
  </main>;
}
