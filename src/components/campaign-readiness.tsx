"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ReadinessRecord = {
  id: string;
  report_date: string;
  reporting_period: "morning" | "evening";
  total_teams: number;
  gts_clear_reinstall_total: number;
  gts_pending: number;
  fionet_installed_total: number;
  fionet_pending: number;
  team_codes_populated: number;
  submitted_at: string;
};

const initialValues = {
  totalTeams: "",
  gtsInstalled: "",
  gtsPending: "",
  fionetInstalled: "",
  fionetPending: "",
  teamCodes: "",
};

function dateKey(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default function CampaignReadiness({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const [period, setPeriod] = useState<"Morning" | "Evening">("Morning");
  const [values, setValues] = useState(initialValues);
  const [records, setRecords] = useState<ReadinessRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeZone, setTimeZone] = useState("");

  const load = useCallback(async () => {
    if (!lgaId) { setError("Your account is not assigned to an LGA."); setLoading(false); return; }
    setLoading(true); setError("");
    const db = createClient();
    const [settingsResult, reportsResult] = await Promise.all([
      db.from("campaign_settings").select("timezone").eq("lga_id", lgaId).maybeSingle(),
      db.from("campaign_readiness_reports").select("id,report_date,reporting_period,total_teams,gts_clear_reinstall_total,gts_pending,fionet_installed_total,fionet_pending,team_codes_populated,submitted_at").eq("lga_id", lgaId).order("report_date", { ascending: false }).order("submitted_at", { ascending: false }).limit(100),
    ]);
    const failure = settingsResult.error ?? reportsResult.error;
    if (failure) setError(failure.message);
    else if (!settingsResult.data) setError("Campaign readiness is not configured for this LGA.");
    else { setTimeZone(settingsResult.data.timezone); setRecords((reportsResult.data ?? []) as ReadinessRecord[]); }
    setLoading(false);
  }, [lgaId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const today = timeZone ? dateKey(timeZone) : "";
  const existing = records.find(
    (record) => record.report_date === today && record.reporting_period === period.toLowerCase()
  );

  function updateValue(field: keyof typeof initialValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
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

    if (!lgaId || !userId || !today || saving) return;
    setSaving(true); setError(""); setNotice("");
    const { error: insertError } = await createClient().from("campaign_readiness_reports").insert({
      lga_id: lgaId,
      report_date: today,
      reporting_period: period.toLowerCase(),
      total_teams: totalTeams,
      gts_clear_reinstall_total: gtsInstalled,
      gts_pending: gtsPending,
      fionet_installed_total: fionetInstalled,
      fionet_pending: fionetPending,
      team_codes_populated: teamCodes,
      submitted_by: userId,
    });
    if (insertError) setError(insertError.message);
    else { setValues(initialValues); setNotice(`${period} readiness report saved.`); await load(); }
    setSaving(false);
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
      {(notice || error) && (
        <div className="plans-notice">
          <span role={error ? "alert" : "status"}>{error || notice}</span>
          <button onClick={() => { setNotice(""); setError(""); }}>×</button>
        </div>
      )}

      <div className="readiness-heading">
        <div>
          <span className="eyebrow">ASSIGNED LGA</span>
          <h2>Campaign Readiness</h2>
          <p>Submit and track daily campaign operational readiness.</p>
        </div>
        <span className="live-label">LGA REPORTS</span>
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
            <strong>{records.some((item) => item.report_date === today && item.reporting_period === "morning") ? "Submitted" : "Pending"}</strong>
          <small>Today&apos;s morning report</small>
        </article>
        <article className="plan-summary-card">
          <span>Evening status</span>
            <strong>{records.some((item) => item.report_date === today && item.reporting_period === "evening") ? "Submitted" : "Pending"}</strong>
          <small>Today&apos;s evening report</small>
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

        {loading ? <div className="plan-empty">Loading today&apos;s submission status…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : existing ? (
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

            <button className="primary-button" type="submit" disabled={saving || loading || !today || !lgaId || !userId || Boolean(error)}>
              {saving ? "Saving…" : `Submit ${period} report →`}
            </button>
          </form>
        )}
      </section>

      <section className="panel readiness-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Submission history</h3>
            <p>Saved morning and evening reports for this LGA</p>
          </div>
          <span className="live-label">{records.length} REPORTS</span>
        </div>

        {loading ? <div className="plan-empty">Loading readiness history…</div> : records.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">▦</div>
            <strong>No readiness reports submitted</strong>
            <p>Your submitted morning and evening reports will appear here.</p>
          </div>
        ) : (
          records.map((record) => (
            <article className="readiness-history-row" key={record.id}>
              <div>
                <strong>{record.report_date}</strong>
                <span>{record.reporting_period} report</span>
              </div>
              <div>
                <span>Total teams</span>
                <strong>{record.total_teams}</strong>
              </div>
              <div>
                <span>GTS completed / pending</span>
                <strong>{record.gts_clear_reinstall_total} / {record.gts_pending}</strong>
              </div>
              <div>
                <span>FIONET installed / pending</span>
                <strong>{record.fionet_installed_total} / {record.fionet_pending}</strong>
              </div>
              <div>
                <span>Team codes populated</span>
                <strong>{record.team_codes_populated}</strong>
              </div>
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Reporting integrity</strong>
        <p>Morning and evening reports are saved separately. Submitted reports are retained as records; corrections follow the authorized amendment workflow.</p>
      </div>
    </div>
  );
}
