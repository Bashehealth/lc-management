"use client";

import { useState } from "react";

type ReadinessRecord = {
  id: number;
  date: string;
  period: "Morning" | "Evening";
  totalTeams: number;
  gtsInstalled: number;
  gtsPending: number;
  fionetInstalled: number;
  fionetPending: number;
  teamCodes: number;
};

const initialValues = {
  totalTeams: "",
  gtsInstalled: "",
  gtsPending: "",
  fionetInstalled: "",
  fionetPending: "",
  teamCodes: "",
};

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function CampaignReadiness() {
  const [period, setPeriod] = useState<"Morning" | "Evening">("Morning");
  const [values, setValues] = useState(initialValues);
  const [records, setRecords] = useState<ReadinessRecord[]>([]);
  const [notice, setNotice] = useState("");

  const today = localDateKey();
  const existing = records.find(
    (record) => record.date === today && record.period === period
  );

  function updateValue(field: keyof typeof initialValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (existing) {
      setNotice(`A ${period.toLowerCase()} readiness report has already been submitted today.`);
      return;
    }

    const numbers = Object.values(values).map((value) => Number(value));

    if (
      Object.values(values).some((value) => value.trim() === "") ||
      numbers.some((value) => !Number.isInteger(value) || value < 0)
    ) {
      setNotice("Complete every field using a valid non-negative whole number.");
      return;
    }

    const [totalTeams, gtsInstalled, gtsPending, fionetInstalled, fionetPending, teamCodes] = numbers;

    if (gtsInstalled + gtsPending > totalTeams) {
      setNotice("GTS installed plus pending cannot exceed the total number of teams.");
      return;
    }

    if (fionetInstalled + fionetPending > totalTeams) {
      setNotice("FIONET installed plus pending cannot exceed the total number of teams.");
      return;
    }

    if (teamCodes > totalTeams) {
      setNotice("Team codes populated cannot exceed the total number of teams.");
      return;
    }

    setRecords((previous) => [
      {
        id: Date.now(),
        date: today,
        period,
        totalTeams,
        gtsInstalled,
        gtsPending,
        fionetInstalled,
        fionetPending,
        teamCodes,
      },
      ...previous,
    ]);

    setValues(initialValues);
    setNotice(`${period} readiness report recorded in demo mode. Database submission is not connected.`);
  }

  const fields: {
    key: keyof typeof initialValues;
    label: string;
    description: string;
  }[] = [
    { key: "totalTeams", label: "Total teams", description: "Total campaign teams in the LGA" },
    { key: "gtsInstalled", label: "GTS Clear & Reinstall", description: "Number of teams completed" },
    { key: "gtsPending", label: "GTS Pending", description: "Number of teams still pending" },
    { key: "fionetInstalled", label: "FIONET installed", description: "Number of teams with FIONET installed" },
    { key: "fionetPending", label: "FIONET pending", description: "Number of teams awaiting installation" },
    { key: "teamCodes", label: "Team codes populated", description: "Number of teams with codes entered" },
  ];

  return (
    <div className="readiness-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="readiness-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Campaign Readiness</h2>
          <p>Submit and track daily campaign operational readiness.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
      </div>

      <div className="readiness-period-selector">
        <button
          type="button"
          className={period === "Morning" ? "readiness-period-active" : ""}
          onClick={() => {
            setPeriod("Morning");
            setNotice("");
            setValues(initialValues);
          }}
        >
          Morning Report
        </button>
        <button
          type="button"
          className={period === "Evening" ? "readiness-period-active" : ""}
          onClick={() => {
            setPeriod("Evening");
            setNotice("");
            setValues(initialValues);
          }}
        >
          Evening Report
        </button>
      </div>

      <div className="readiness-summary-grid">
        <article className="plan-summary-card">
          <span>Reporting date</span>
          <strong>{today}</strong>
          <small>Local calendar date</small>
        </article>
        <article className="plan-summary-card">
          <span>Selected period</span>
          <strong>{period}</strong>
          <small>Independent daily submission</small>
        </article>
        <article className="plan-summary-card">
          <span>Morning status</span>
          <strong>{records.some((item) => item.date === today && item.period === "Morning") ? "Submitted" : "Pending"}</strong>
          <small>Today's morning report</small>
        </article>
        <article className="plan-summary-card">
          <span>Evening status</span>
          <strong>{records.some((item) => item.date === today && item.period === "Evening") ? "Submitted" : "Pending"}</strong>
          <small>Today's evening report</small>
        </article>
      </div>

      <section className="panel readiness-form-panel">
        <div className="panel-heading">
          <div>
            <h3>{period} readiness report</h3>
            <p>Enter the current operational figures for your LGA.</p>
          </div>
          <span className="live-label">{existing ? "ALREADY SUBMITTED" : "AWAITING SUBMISSION"}</span>
        </div>

        {existing ? (
          <div className="readiness-existing-report">
            <strong>This reporting period has already been submitted today.</strong>
            <p>Submitted figures are shown in the report history below. Corrections will require an authorized amendment workflow.</p>
          </div>
        ) : (
          <form onSubmit={submitReport}>
            <div className="readiness-fields-grid">
              {fields.map((field) => (
                <label className="readiness-field" key={field.key}>
                  <span>{field.label}</span>
                  <small>{field.description}</small>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={values[field.key]}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder="Enter number"
                  />
                </label>
              ))}
            </div>

            <div className="readiness-validation-note">
              Enter whole numbers only. Installed and pending counts must not exceed total teams.
            </div>

            <button className="primary-button" type="submit">
              Submit {period} report →
            </button>
          </form>
        )}
      </section>

      <section className="panel readiness-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Submission history</h3>
            <p>Morning and evening reports recorded in this session</p>
          </div>
          <span className="live-label">{records.length} REPORTS</span>
        </div>

        {records.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">▦</div>
            <strong>No readiness reports submitted</strong>
            <p>Your submitted morning and evening reports will appear here.</p>
          </div>
        ) : (
          records.map((record) => (
            <article className="readiness-history-row" key={record.id}>
              <div>
                <strong>{record.date}</strong>
                <span>{record.period} report</span>
              </div>
              <div>
                <span>Total teams</span>
                <strong>{record.totalTeams}</strong>
              </div>
              <div>
                <span>GTS completed / pending</span>
                <strong>{record.gtsInstalled} / {record.gtsPending}</strong>
              </div>
              <div>
                <span>FIONET installed / pending</span>
                <strong>{record.fionetInstalled} / {record.fionetPending}</strong>
              </div>
              <div>
                <span>Team codes populated</span>
                <strong>{record.teamCodes}</strong>
              </div>
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Reporting integrity</strong>
        <p>Morning and evening reports are separate submissions. This demo stores records only in temporary browser state. Permanent records, supervisor review, and amendment history will be connected to the database later.</p>
      </div>
    </div>
  );
}
