"use client";

import { useMemo, useState } from "react";

const lgaData = [
  { lga: "Bade", planned: 12, ongoing: 5, reported: 4, verified: 3, overdue: 1, returned: 1 },
  { lga: "Bursari", planned: 10, ongoing: 4, reported: 3, verified: 2, overdue: 2, returned: 0 },
  { lga: "Damaturu", planned: 15, ongoing: 7, reported: 5, verified: 4, overdue: 1, returned: 2 },
  { lga: "Fika", planned: 11, ongoing: 5, reported: 3, verified: 2, overdue: 1, returned: 1 },
  { lga: "Fune", planned: 13, ongoing: 6, reported: 4, verified: 3, overdue: 2, returned: 1 },
  { lga: "Geidam", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Gujba", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Jakusko", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Karasuwa", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Machina", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Nangere", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Nguru", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Potiskum", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Tarmuwa", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Yunusari", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
  { lga: "Yusufari", planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 },
];

const reports = [
  { title: "Yobe State Monthly Operational Report", period: "October 2026", status: "Approved", approvedBy: "Senior Supervisor", approvedAt: "2026-11-02" },
  { title: "Campaign Implementation Report", period: "October 2026", status: "Approved", approvedBy: "Senior Supervisor", approvedAt: "2026-11-02" },
  { title: "Yobe State Monthly Operational Report", period: "November 2026", status: "Pending review", approvedBy: "—", approvedAt: "—" },
];

type Tab = "Overview" | "LGA Performance" | "Reports" | "Operations";

export default function BossDashboard() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [period, setPeriod] = useState("November 2026");
  const [lgaFilter, setLgaFilter] = useState("All");

  const totals = useMemo(() => lgaData.reduce((sum, row) => ({
    planned: sum.planned + row.planned,
    ongoing: sum.ongoing + row.ongoing,
    reported: sum.reported + row.reported,
    verified: sum.verified + row.verified,
    overdue: sum.overdue + row.overdue,
    returned: sum.returned + row.returned,
  }), { planned: 0, ongoing: 0, reported: 0, verified: 0, overdue: 0, returned: 0 }), []);

  const filteredLgas = lgaData.filter((row) => lgaFilter === "All" || row.lga === lgaFilter);
  const approvedReports = reports.filter((report) => report.status === "Approved").length;
  const coveredLgas = lgaData.filter((row) => row.planned > 0).length;

  return (
    <div className="boss-dashboard-module">
      <header className="boss-dashboard-header">
        <div>
          <span className="eyebrow">EXECUTIVE VIEW · YOBE STATE</span>
          <h1>State Performance Overview</h1>
          <p>Consolidated programme performance and approved management reports.</p>
        </div>
        <span className="live-label">READ ONLY · DEMO DATA</span>
      </header>

      <section className="boss-dashboard-controls panel">
        <label>
          Reporting period
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option>November 2026</option>
            <option>October 2026</option>
            <option>September 2026</option>
          </select>
        </label>
        <span>Viewer access only. Changes and approvals are disabled.</span>
      </section>

      <nav className="boss-dashboard-tabs" aria-label="Executive dashboard sections">
        {(["Overview", "LGA Performance", "Reports", "Operations"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      {tab === "Overview" && (
        <>
          <div className="boss-dashboard-summary">
            <article className="panel"><span>Official LGAs</span><strong>16</strong><small>Statewide coverage</small></article>
            <article className="panel"><span>LGAs with sample records</span><strong>{coveredLgas}/16</strong><small>Data coverage</small></article>
            <article className="panel"><span>Reported completed</span><strong>{totals.reported}</strong><small>Not all verified</small></article>
            <article className="panel"><span>Supervisor verified</span><strong>{totals.verified}</strong><small>Verified sample records</small></article>
          </div>

          <section className="panel">
            <div className="panel-heading"><div><h2>State activity summary</h2><p>Figures are illustrative and incomplete.</p></div></div>
            <div className="boss-metric-grid">
              <div><span>Planned</span><strong>{totals.planned}</strong></div>
              <div><span>Ongoing</span><strong>{totals.ongoing}</strong></div>
              <div><span>Reported completed</span><strong>{totals.reported}</strong></div>
              <div><span>Overdue</span><strong>{totals.overdue}</strong></div>
              <div><span>Returned for revision</span><strong>{totals.returned}</strong></div>
              <div><span>Verified completed</span><strong>{totals.verified}</strong></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Management report status</h2><p>Only approved reports are available for executive review.</p></div></div>
            <div className="boss-report-list">
              {reports.filter((report) => report.status === "Approved").map((report) => (
                <article key={`${report.title}-${report.period}`}>
                  <div><strong>{report.title}</strong><span>{report.period} · Approved by {report.approvedBy}</span></div>
                  <span className="status-badge approved">Approved</span>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "LGA Performance" && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>All 16 LGA performance</h2><p>Zero figures indicate unavailable sample data, not confirmed zero performance.</p></div>
            <select value={lgaFilter} onChange={(event) => setLgaFilter(event.target.value)}>
              <option value="All">All LGAs</option>
              {lgaData.map((row) => <option key={row.lga}>{row.lga}</option>)}
            </select>
          </div>
          <div className="boss-table-wrap">
            <table className="boss-table">
              <thead><tr><th>LGA</th><th>Planned</th><th>Ongoing</th><th>Reported</th><th>Verified</th><th>Overdue</th><th>Returned</th></tr></thead>
              <tbody>
                {filteredLgas.map((row) => (
                  <tr key={row.lga}>
                    <td><strong>{row.lga}</strong></td><td>{row.planned}</td><td>{row.ongoing}</td><td>{row.reported}</td><td>{row.verified}</td><td>{row.overdue}</td><td>{row.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "Reports" && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Approved management reports</h2><p>Read-only list of reports shared with the Boss.</p></div></div>
          <div className="boss-report-list">
            {reports.filter((report) => report.status === "Approved").map((report) => (
              <article key={`${report.title}-${report.period}`}>
                <div><strong>{report.title}</strong><span>Period: {report.period}</span><span>Approved by: {report.approvedBy}</span><span>Approval date: {report.approvedAt}</span></div>
                <span className="status-badge approved">Read only</span>
              </article>
            ))}
          </div>
          <p className="campaign-monitoring-note">PDF and Excel downloads will be enabled after secure report storage and sharing are implemented.</p>
        </section>
      )}

      {tab === "Operations" && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Operational oversight</h2><p>Sample indicators only; live campaign data is not connected.</p></div></div>
          <div className="boss-metric-grid">
            <div><span>Monthly working-day allocation</span><strong>15 days</strong></div>
            <div><span>Daily check-in deadline</span><strong>10:30 AM</strong></div>
            <div><span>Readiness reporting</span><strong>Twice daily</strong></div>
            <div><span>Campaign reporting LGAs</span><strong>16</strong></div>
          </div>
          <div className="plans-notice">
            Working-day claims, movement requests, morning/evening readiness, device installation and supportive-supervision records will appear here once their live data sources are connected.
          </div>
        </section>
      )}

      <footer className="boss-dashboard-footer">
        <strong>Executive access is read-only.</strong>
        <span>No editing, approvals, assignments or movement decisions are available in this workspace.</span>
      </footer>
      <div className="plans-notice">
        <strong>Prototype boundary:</strong> All figures and report records are illustrative. The dashboard is not yet connected to approved database records, and it must not be used as an official management report.
      </div>
    </div>
  );
}
