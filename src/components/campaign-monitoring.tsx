"use client";

import { useMemo, useState } from "react";

const lgaNames = [
  "Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Jakusko",
  "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari",
];

type Checkin = {
  lga: string;
  officer: string;
  time: string;
  status: "On time" | "Late" | "Missing";
  location: string;
  accuracy: string;
};

const checkins: Checkin[] = [
  { lga: "Bade", officer: "Haruna Bello Ibrahim", time: "09:42", status: "On time", location: "Within assigned LGA", accuracy: "12 m" },
  { lga: "Bursari", officer: "Ibrahim Yusuf Muhammad", time: "10:18", status: "On time", location: "Within assigned LGA", accuracy: "18 m" },
  { lga: "Damaturu", officer: "Mustapha Jibrin", time: "10:46", status: "Late", location: "Within assigned LGA", accuracy: "9 m" },
  { lga: "Fika", officer: "Abubakar Musa", time: "09:55", status: "On time", location: "Within assigned LGA", accuracy: "21 m" },
  { lga: "Fune", officer: "Bashir Abubakar", time: "10:02", status: "On time", location: "Within assigned LGA", accuracy: "14 m" },
  { lga: "Geidam", officer: "Mohammed Gaji", time: "—", status: "Missing", location: "Not submitted", accuracy: "—" },
  { lga: "Gujba", officer: "Mamman Abdulwakil", time: "09:51", status: "On time", location: "Within assigned LGA", accuracy: "16 m" },
  { lga: "Jakusko", officer: "Mohammed Aliyu Suleiman", time: "—", status: "Missing", location: "Not submitted", accuracy: "—" },
  { lga: "Karasuwa", officer: "Mubarak Isa", time: "10:12", status: "On time", location: "Within assigned LGA", accuracy: "11 m" },
  { lga: "Machina", officer: "Bashir Mohammed Idris", time: "10:37", status: "Late", location: "Within assigned LGA", accuracy: "25 m" },
  { lga: "Nangere", officer: "Halima Ahmad Usman", time: "09:48", status: "On time", location: "Within assigned LGA", accuracy: "13 m" },
  { lga: "Nguru", officer: "Jamilu Aminu Yunusa", time: "09:58", status: "On time", location: "Within assigned LGA", accuracy: "17 m" },
  { lga: "Potiskum", officer: "Abubakar Ibrahim", time: "—", status: "Missing", location: "Not submitted", accuracy: "—" },
  { lga: "Tarmuwa", officer: "Hafsatu Umar Machina", time: "10:21", status: "On time", location: "Within assigned LGA", accuracy: "19 m" },
  { lga: "Yunusari", officer: "Adam Bello", time: "10:05", status: "On time", location: "Within assigned LGA", accuracy: "15 m" },
  { lga: "Yusufari", officer: "Wakil Grema", time: "10:42", status: "Late", location: "Within assigned LGA", accuracy: "22 m" },
];

const readiness = [
  { lga: "Bade", morning: "Submitted", evening: "Pending", teams: 18, gts: 16, gtsPending: 2, fionet: 15, fionetPending: 3 },
  { lga: "Bursari", morning: "Submitted", evening: "Pending", teams: 14, gts: 14, gtsPending: 0, fionet: 12, fionetPending: 2 },
  { lga: "Damaturu", morning: "Submitted", evening: "Submitted", teams: 25, gts: 22, gtsPending: 3, fionet: 24, fionetPending: 1 },
  { lga: "Fika", morning: "Submitted", evening: "Pending", teams: 17, gts: 15, gtsPending: 2, fionet: 16, fionetPending: 1 },
  { lga: "Fune", morning: "Submitted", evening: "Submitted", teams: 20, gts: 18, gtsPending: 2, fionet: 19, fionetPending: 1 },
];

const deviceRows = [
  { lga: "Fune", activity: "GTS Clear & Reinstall", expected: 20, completed: 18, blocker: "Two teams awaiting device access" },
  { lga: "Damaturu", activity: "FIONET installation", expected: 25, completed: 24, blocker: "One device pending" },
  { lga: "Bade", activity: "GTS Clear & Reinstall", expected: 18, completed: 16, blocker: "Network interruption" },
  { lga: "Nguru", activity: "FIONET installation", expected: 16, completed: 16, blocker: "None reported" },
];

const visits = [
  { lga: "Fune", officer: "Bashir Abubakar", ward: "Damagum", settlement: "Damagum Town", team: "FUNE-04", date: "2026-11-02", observation: "Team activity reviewed; follow-up on device installation." },
  { lga: "Damaturu", officer: "Mustapha Jibrin", ward: "Maisandari", settlement: "Maisandari", team: "DAM-02", date: "2026-11-02", observation: "Supportive supervision and field coaching." },
  { lga: "Bade", officer: "Haruna Bello Ibrahim", ward: "Gashua", settlement: "Gashua", team: "BAD-03", date: "2026-11-01", observation: "Field observation completed." },
];

type Tab = "Check-ins" | "Readiness" | "Devices" | "Supervision" | "Exceptions";

export default function CampaignMonitoring() {
  const [tab, setTab] = useState<Tab>("Check-ins");
  const [lgaFilter, setLgaFilter] = useState("All");
  const [period, setPeriod] = useState("Morning");
  const [exceptions, setExceptions] = useState<Record<string, string>>({});

  const filteredCheckins = useMemo(
    () => checkins.filter((item) => lgaFilter === "All" || item.lga === lgaFilter),
    [lgaFilter]
  );

  const submitted = checkins.filter((item) => item.status !== "Missing").length;
  const late = checkins.filter((item) => item.status === "Late").length;
  const missing = checkins.filter((item) => item.status === "Missing").length;
  const pendingEvening = readiness.filter((item) => item.evening === "Pending").length;

  function recordException(lga: string) {
    const comment = (exceptions[lga] || "").trim();
    if (!comment) {
      alert("Enter a review note before recording this exception.");
      return;
    }
    alert(`Demo review note recorded for ${lga}: ${comment}`);
    setExceptions((current) => ({ ...current, [lga]: "" }));
  }

  return (
    <div className="campaign-monitoring-module">
      <header className="campaign-monitoring-header">
        <div>
          <span className="eyebrow">STATEWIDE OPERATIONS</span>
          <h1>Campaign Monitoring</h1>
          <p>Monitor field reporting, readiness, device progress and supportive supervision across all 16 LGAs.</p>
        </div>
        <span className="live-label">DEMO DATA</span>
      </header>

      <div className="campaign-monitoring-summary">
        <article className="panel"><span>LGAs</span><strong>16</strong><small>Statewide coverage</small></article>
        <article className="panel"><span>Check-ins received</span><strong>{submitted}/16</strong><small>Sample records</small></article>
        <article className="panel"><span>Late check-ins</span><strong>{late}</strong><small>Require review</small></article>
        <article className="panel"><span>Missing check-ins</span><strong>{missing}</strong><small>Follow-up required</small></article>
      </div>

      <nav className="campaign-monitoring-tabs" aria-label="Campaign monitoring sections">
        {(["Check-ins", "Readiness", "Devices", "Supervision", "Exceptions"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      {tab === "Check-ins" && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Daily LGA check-ins</h2><p>Illustrative 10:30 AM reporting deadline.</p></div>
            <select value={lgaFilter} onChange={(event) => setLgaFilter(event.target.value)}>
              <option value="All">All LGAs</option>
              {lgaNames.map((lga) => <option key={lga}>{lga}</option>)}
            </select>
          </div>
          <div className="campaign-monitoring-table-wrap">
            <table className="campaign-monitoring-table">
              <thead><tr><th>LGA / Officer</th><th>Time</th><th>Status</th><th>Reported location</th><th>GPS accuracy</th></tr></thead>
              <tbody>
                {filteredCheckins.map((item) => (
                  <tr key={item.lga}>
                    <td><strong>{item.lga}</strong><small>{item.officer}</small></td>
                    <td>{item.time}</td>
                    <td><span className={`status-badge ${item.status.toLowerCase().replace(" ", "-")}`}>{item.status}</span></td>
                    <td>{item.location}</td><td>{item.accuracy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="campaign-monitoring-note">GPS information is a reported device location, not proof of presence. Accuracy and location exceptions require human review.</p>
        </section>
      )}

      {tab === "Readiness" && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Campaign readiness</h2><p>Review separate morning and evening submissions.</p></div>
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option>Morning</option><option>Evening</option>
            </select>
          </div>
          <div className="campaign-monitoring-table-wrap">
            <table className="campaign-monitoring-table">
              <thead><tr><th>LGA</th><th>{period} submission</th><th>Total teams</th><th>GTS installed</th><th>GTS pending</th><th>FIONET installed</th><th>FIONET pending</th></tr></thead>
              <tbody>
                {readiness.map((item) => (
                  <tr key={item.lga}>
                    <td><strong>{item.lga}</strong></td>
                    <td><span className={`status-badge ${item[period.toLowerCase() as "morning" | "evening"] === "Submitted" ? "approved" : "pending"}`}>{item[period.toLowerCase() as "morning" | "evening"]}</span></td>
                    <td>{item.teams}</td><td>{item.gts}</td><td>{item.gtsPending}</td><td>{item.fionet}</td><td>{item.fionetPending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="campaign-monitoring-note">Only five sample LGA records are shown here. Production monitoring must include all 16 LGAs and validate team codes and totals against submitted records.</p>
        </section>
      )}

      {tab === "Devices" && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Device progress</h2><p>Reported installation and configuration progress.</p></div></div>
          <div className="campaign-monitoring-table-wrap">
            <table className="campaign-monitoring-table">
              <thead><tr><th>LGA</th><th>Activity</th><th>Expected</th><th>Completed</th><th>Pending</th><th>Blocker</th></tr></thead>
              <tbody>{deviceRows.map((item, index) => (
                <tr key={index}><td><strong>{item.lga}</strong></td><td>{item.activity}</td><td>{item.expected}</td><td>{item.completed}</td><td>{item.expected - item.completed}</td><td>{item.blocker}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="campaign-monitoring-note">Reported completion is not verified completion. Supervisors must inspect submitted evidence before accepting results.</p>
        </section>
      )}

      {tab === "Supervision" && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Supportive supervision visits</h2><p>Each visit is a separate field record linked to its parent task.</p></div></div>
          <div className="campaign-supervision-list">
            {visits.map((visit, index) => (
              <article className="campaign-supervision-card" key={index}>
                <div><strong>{visit.lga} LGA</strong><span>{visit.date} · {visit.officer}</span></div>
                <p><strong>Ward:</strong> {visit.ward} · <strong>Settlement:</strong> {visit.settlement}</p>
                <p><strong>Team code:</strong> {visit.team}</p>
                <p>{visit.observation}</p>
              </article>
            ))}
          </div>
          <p className="campaign-monitoring-note">Visit photos, GPS coordinates and linked task evidence are not available in these sample records.</p>
        </section>
      )}

      {tab === "Exceptions" && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Exceptions requiring attention</h2><p>Record a human review note; do not infer misconduct from an exception.</p></div></div>
          <div className="campaign-exception-list">
            {checkins.filter((item) => item.status !== "On time").map((item) => (
              <article className="campaign-exception-card" key={item.lga}>
                <div><strong>{item.lga} LGA</strong><span>{item.status} check-in · {item.time}</span></div>
                <label>
                  Supervisor review note
                  <textarea value={exceptions[item.lga] || ""} onChange={(event) => setExceptions((current) => ({ ...current, [item.lga]: event.target.value }))} placeholder="Record the follow-up or explanation..." />
                </label>
                <button className="secondary-button" type="button" onClick={() => recordException(item.lga)}>Record review note</button>
              </article>
            ))}
            {pendingEvening > 0 && <p className="campaign-monitoring-note">{pendingEvening} sample LGAs have not submitted evening readiness.</p>}
          </div>
          <p className="campaign-monitoring-note">Review notes in this prototype are not saved to a database and will not survive a refresh.</p>
        </section>
      )}

      <div className="plans-notice">
        <strong>Prototype boundary:</strong> All monitoring records on this screen are illustrative local data. It does not yet retrieve live submissions, authenticate reviewers, or persist review notes. Do not use it to make operational or personnel decisions.
      </div>
    </div>
  );
}
