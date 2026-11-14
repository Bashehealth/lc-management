"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { programmeStates } from "@/lib/programme-states.mjs";
import { contactLabel, filterBossPersonnel, mergeProgrammeStates, summarizeBossWorkingDays } from "@/lib/boss-executive-reporting.mjs";

type BossView = "overview" | "personnel" | "state" | "working-days" | "comparisons" | "archive";
type StateSummary = { state_id: string; state_code: string; state_name: string; registered_lgas: number; active_lgas: number | null; lga_coordinators: number; state_coordinators: number; senior_supervisors: number; verified_working_days: number; pending_working_days: number; returned_working_days: number; rejected_working_days: number };
type Overview = { summary: { programme_state_count: number; lga_coordinator_count: number; state_coordinator_count: number; senior_supervisor_count: number; registered_lga_count: number; active_lga_count: number | null; verified_working_days: number }; states: StateSummary[] };
type Person = { person_id: string; role: "lga_coordinator" | "state_coordinator" | "senior_supervisor"; full_name: string; state_id: string | null; state_code: string | null; state_name: string | null; lga_id: string | null; lga_name: string | null; email: string | null; phone_number: string | null; verified_working_days: number };
type StateDetail = { state: { state_id: string; state_code: string; state_name: string; lga_coordinators: number; state_coordinators: number; senior_supervisors: number; registered_lgas: number }; lgas: { lga_id: string; lga_name: string; lga_coordinators: number; active_lga: boolean | null; verified_working_days: number; pending_working_days: number; returned_working_days: number; rejected_working_days: number }[] };
type WorkingDayRow = { state_id: string; state_code: string; state_name: string; lga_id: string; lga_name: string; lc_id: string | null; lc_name: string | null; approved_days: number; pending_days: number; returned_days: number; rejected_days: number };
type ComparisonRow = { state_name: string; lga_id: string; lga_name: string; task_total: number; task_completed: number; working_days_approved: number; campaign_checkins: number; readiness_reports: number };
type ArchiveRow = { report_id: string; state_name: string; lga_name: string | null; report_type: string; period_start: string; period_end: string; status: string; created_at: string; reviewed_at: string | null; content: Record<string, unknown> };

const titles: Record<BossView, string> = {
  overview: "Programme Overview", personnel: "Personnel Directory", state: "State Drilldown",
  "working-days": "Working Days Monitor", comparisons: "LGA Comparisons", archive: "Report Archive",
};
const currentMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const dateLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const roleLabel = (role: string) => ({ lga_coordinator: "LGA Coordinator", state_coordinator: "State Coordinator", senior_supervisor: "Senior Supervisor" }[role] ?? role);
const countLabel = (value: number | null | undefined) => value == null ? "Not recorded" : value.toLocaleString();

export default function BossDashboard({ view = "overview" }: { view?: BossView }) {
  const [month, setMonth] = useState(currentMonth);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [workingDays, setWorkingDays] = useState<WorkingDayRow[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonRow[]>([]);
  const [archive, setArchive] = useState<ArchiveRow[]>([]);
  const [stateDetail, setStateDetail] = useState<StateDetail | null>(null);
  const [selectedStateCode, setSelectedStateCode] = useState("all");
  const [selectedLgaId, setSelectedLgaId] = useState<string | null>(null);
  const [selectedLcId, setSelectedLcId] = useState<string | null>(null);
  const [directoryState, setDirectoryState] = useState("all");
  const [directoryLga, setDirectoryLga] = useState("all");
  const [directoryRole, setDirectoryRole] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"task_completed" | "working_days_approved" | "campaign_checkins">("task_completed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const db = createClient();
    try {
      if (["overview", "personnel", "state", "working-days"].includes(view)) {
        const { data: overviewData, error: overviewError } = await db.rpc("boss_executive_overview", { p_month: `${month}-01` });
        if (overviewError) throw new Error(`Boss executive reporting is unavailable. Apply and verify the reviewed reporting proposal in an isolated database first. ${overviewError.message}`);
        const loadedOverview = overviewData as Overview;
        setOverview(loadedOverview);

        if (view === "personnel") {
          const selectedState = directoryState === "all" ? null : loadedOverview.states.find((row) => row.state_code === directoryState);
          const { data, error: directoryError } = selectedState || directoryState === "all"
            ? await db.rpc("boss_personnel_directory", {
              p_state_id: selectedState?.state_id ?? null,
              p_role: directoryRole === "all" ? null : directoryRole,
              p_search: search.trim() || null,
              p_month: `${month}-01`,
            })
            : { data: [], error: null };
          if (directoryError) throw directoryError;
          setPeople((data ?? []) as Person[]);
        } else if ((view === "overview" || view === "state") && selectedStateCode !== "all") {
          const selectedState = loadedOverview.states.find((row) => row.state_code === selectedStateCode);
          if (!selectedState) {
            setStateDetail(null);
            setPeople([]);
          } else {
            const [detailResult, peopleResult] = await Promise.all([
              db.rpc("boss_state_drilldown", { p_state_id: selectedState.state_id, p_month: `${month}-01` }),
              db.rpc("boss_personnel_directory", { p_state_id: selectedState.state_id, p_role: null, p_search: null, p_month: `${month}-01` }),
            ]);
            if (detailResult.error) throw detailResult.error;
            if (peopleResult.error) throw peopleResult.error;
            setStateDetail(detailResult.data as StateDetail);
            setPeople((peopleResult.data ?? []) as Person[]);
          }
        } else {
          setStateDetail(null);
          setPeople([]);
        }

        if (view === "working-days") {
          const { data, error: daysError } = await db.rpc("boss_working_day_overview", { p_month: `${month}-01` });
          if (daysError) throw daysError;
          setWorkingDays((data ?? []) as WorkingDayRow[]);
        }
        if (view === "overview" || view === "state") {
          const { data, error: comparisonError } = await db.rpc("boss_lga_comparisons");
          if (!comparisonError) setComparisons((data ?? []) as ComparisonRow[]);
        }
      } else if (view === "comparisons") {
        const { data, error: comparisonError } = await db.rpc("boss_lga_comparisons");
        if (comparisonError) throw comparisonError;
        setComparisons((data ?? []) as ComparisonRow[]);
      } else {
        const { data, error: archiveError } = await db.rpc("boss_report_archive");
        if (archiveError) throw archiveError;
        setArchive((data ?? []) as ArchiveRow[]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Executive data could not be loaded. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [view, month, directoryState, directoryRole, search, selectedStateCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const states = useMemo(() => mergeProgrammeStates(programmeStates, overview?.states ?? []), [overview]);
  const visiblePeople = useMemo(() => filterBossPersonnel(people, {
    lgaId: directoryLga,
  }), [people, directoryLga]);
  const workingTotals = useMemo(() => summarizeBossWorkingDays(workingDays), [workingDays]);
  const filteredDays = useMemo(() => workingDays.filter((row) =>
    (directoryState === "all" || row.state_code === directoryState) &&
    (directoryLga === "all" || row.lga_id === directoryLga)), [workingDays, directoryState, directoryLga]);
  const orderedComparisons = useMemo(() => [...comparisons].sort((a, b) => Number(b[sortBy]) - Number(a[sortBy])), [comparisons, sortBy]);
  const contentText = (content: Record<string, unknown>) => [content.achievements, content.challenges, content.recommendations].filter((item) => typeof item === "string" && item.trim()).join(" · ") || "Approved report content not recorded.";
  const lgaOptions = [...new Map(people.filter((person) => person.lga_id && person.lga_name).map((person) => [person.lga_id!, { id: person.lga_id!, name: person.lga_name! }])).values()];
  const dayLgaOptions = [...new Map(workingDays.filter((row) => directoryState === "all" || row.state_code === directoryState).map((row) => [row.lga_id, { id: row.lga_id, name: row.lga_name }])).values()];
  const selectedState = states.find((state) => state.code === selectedStateCode);
  const selectedLga = stateDetail?.lgas.find((lga) => lga.lga_id === selectedLgaId);
  const selectedLc = people.find((person) => person.person_id === selectedLcId);
  const statePeople = people;
  const stateLcs = statePeople.filter((person) => person.role === "lga_coordinator");
  const stateScs = statePeople.filter((person) => person.role === "state_coordinator");
  const stateSeniors = statePeople.filter((person) => person.role === "senior_supervisor");

  function openState(code: string) {
    setSelectedStateCode(code);
    setSelectedLgaId(null);
    setSelectedLcId(null);
  }

  return <div className="boss-dashboard-module">
    <header className="boss-dashboard-header"><div><span className="eyebrow">EXECUTIVE VIEW · 15 PROGRAMME STATES</span><h2>{view === "overview" ? "Programme-Wide Health Operations" : titles[view]}</h2><p>Read-only operational information from Boss-authorized reporting functions.</p></div><span className="live-label">READ ONLY</span></header>
    <div className="boss-executive-toolbar"><label htmlFor="boss-month">Reporting month<input id="boss-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><span>{dateLabel(month)}</span><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh data"}</button></div>
    {error && <section className="panel boss-error" role="alert"><h3>Executive data is unavailable</h3><p>{error}</p></section>}
    {loading ? <section className="panel boss-loading" aria-label="Loading executive data"><span /><span /><span /><span /><span /></section> : !error && <>
      {view === "overview" && <>
        <section className="boss-executive-metrics">
          <article className="panel"><span>Programme states</span><strong>15</strong><small>Authoritative programme directory</small></article>
          <article className="panel"><span>Registered LGA Coordinators</span><strong>{countLabel(overview?.summary.lga_coordinator_count)}</strong></article>
          <article className="panel"><span>Registered State Coordinators</span><strong>{countLabel(overview?.summary.state_coordinator_count)}</strong></article>
          <article className="panel"><span>Registered Senior Supervisors</span><strong>{countLabel(overview?.summary.senior_supervisor_count)}</strong></article>
          <article className="panel"><span>Active LGAs</span><strong>{countLabel(overview?.summary.active_lga_count)}</strong><small>{overview?.summary.registered_lga_count ?? 0} registered · status unclassified where shown</small></article>
          <article className="panel"><span>Verified working days</span><strong>{countLabel(overview?.summary.verified_working_days)}</strong><small>Approved records · {dateLabel(month)}</small></article>
        </section>
        <section className="panel boss-section"><div className="panel-heading"><div><h3>Programme state coverage</h3><p>Select a configured state to inspect SCs, Senior Supervisors, LGAs and LCs.</p></div></div>
          <div className="boss-state-cards">{states.map((state) => <button type="button" key={state.code} className="boss-state-card" disabled={!state.configured} onClick={() => openState(state.code)}>
            <span>{state.configured ? state.code : "DATABASE SETUP REQUIRED"}</span><strong>{state.name}</strong>
            <small>{state.configured ? `${countLabel(state.registered_lgas)} registered LGAs · ${countLabel(state.lga_coordinators)} LCs` : "No state row or operational figures are configured."}</small>
            {state.configured && <small>{countLabel(state.verified_working_days)} approved days · {countLabel(state.pending_working_days)} pending</small>}
          </button>)}</div>
        </section>
        {selectedStateCode !== "all" && <StateDrilldown month={month} state={selectedState} detail={stateDetail} stateLcs={stateLcs} stateScs={stateScs} stateSeniors={stateSeniors} selectedLga={selectedLga} selectedLc={selectedLc} selectedLgaId={selectedLgaId} selectedLcId={selectedLcId} onBack={() => openState("all")} onBackLga={() => { setSelectedLgaId(null); setSelectedLcId(null); }} onLga={(id) => { setSelectedLgaId(id); setSelectedLcId(null); }} onLc={setSelectedLcId} />}
        <section className="panel boss-section"><div className="panel-heading"><div><h3>Quick programme signals</h3><p>Statewide LGA comparisons use the existing Boss aggregate reporting RPC.</p></div></div>
          <div className="boss-quick-table"><div className="boss-table-wrap"><table className="boss-table"><thead><tr><th>State</th><th>LGA</th><th>Tasks complete</th><th>Approved days</th><th>Campaign check-ins</th></tr></thead><tbody>{orderedComparisons.slice(0, 10).map((row) => <tr key={row.lga_id}><td>{row.state_name}</td><td>{row.lga_name}</td><td>{row.task_completed} / {row.task_total}</td><td>{row.working_days_approved}</td><td>{row.campaign_checkins}</td></tr>)}</tbody></table></div>{!orderedComparisons.length && <p className="boss-empty">No comparison rows are available.</p>}</div>
        </section>
      </>}

      {view === "personnel" && <section className="panel boss-section"><div className="panel-heading"><div><h3>Registered personnel</h3><p>Names and contacts are returned only by the Boss-authorized directory RPC.</p></div><span>{visiblePeople.length} people</span></div>
        <div className="boss-directory-filters"><label>Search by name<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a name" /></label>
          <label>State<select value={directoryState} onChange={(event) => { setDirectoryState(event.target.value); setDirectoryLga("all"); }}><option value="all">All programme states</option>{programmeStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>
          <label>Role<select value={directoryRole} onChange={(event) => setDirectoryRole(event.target.value)}><option value="all">All directory roles</option><option value="lga_coordinator">LGA Coordinator</option><option value="state_coordinator">State Coordinator</option><option value="senior_supervisor">Senior Supervisor</option></select></label>
          <label>LGA<select value={directoryLga} onChange={(event) => setDirectoryLga(event.target.value)}><option value="all">All LGAs</option>{lgaOptions.map((lga) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}</select></label>
        </div>
        {!visiblePeople.length ? <p className="boss-empty">No registered personnel match these filters.</p> : <div className="boss-table-wrap"><table className="boss-table"><thead><tr><th>Name</th><th>Role</th><th>State</th><th>Assigned LGA</th><th>Email</th><th>Phone</th><th>Verified days · {dateLabel(month)}</th></tr></thead><tbody>{visiblePeople.map((person) => <tr key={person.person_id}><td>{person.full_name}</td><td>{roleLabel(person.role)}</td><td>{person.state_name ?? "Not assigned"}</td><td>{person.lga_name ?? "—"}</td><td>{contactLabel(person.email)}</td><td>{contactLabel(person.phone_number)}</td><td>{person.role === "lga_coordinator" ? person.verified_working_days : "—"}</td></tr>)}</tbody></table></div>}
        <p className="boss-boundary-note">Email comes from the linked Auth user through the restricted reporting RPC. Phone is not recorded in the current profile schema; it is shown as “Not provided”.</p>
      </section>}

      {view === "state" && <>
        {selectedStateCode === "all" ? <section className="panel boss-section"><div className="panel-heading"><div><h3>Select a programme state</h3><p>States without database setup remain visible and are not assigned invented personnel.</p></div></div><div className="boss-state-cards">{states.map((state) => <button type="button" key={state.code} className="boss-state-card" disabled={!state.configured} onClick={() => openState(state.code)}><span>{state.configured ? state.code : "DATABASE SETUP REQUIRED"}</span><strong>{state.name}</strong><small>{state.configured ? `${countLabel(state.registered_lgas)} registered LGAs` : "No database state record."}</small></button>)}</div></section>
          : <StateDrilldown month={month} state={selectedState} detail={stateDetail} stateLcs={stateLcs} stateScs={stateScs} stateSeniors={stateSeniors} selectedLga={selectedLga} selectedLc={selectedLc} selectedLgaId={selectedLgaId} selectedLcId={selectedLcId} onBack={() => openState("all")} onBackLga={() => { setSelectedLgaId(null); setSelectedLcId(null); }} onLga={(id) => { setSelectedLgaId(id); setSelectedLcId(null); }} onLc={setSelectedLcId} />}
      </>}

      {view === "working-days" && <>
        <section className="boss-executive-metrics boss-day-metrics"><article className="panel"><span>Approved · verified</span><strong>{workingTotals.approved}</strong></article><article className="panel"><span>Claimed · pending</span><strong>{workingTotals.pending}</strong></article><article className="panel"><span>Returned</span><strong>{workingTotals.returned}</strong></article><article className="panel"><span>Rejected</span><strong>{workingTotals.rejected}</strong></article></section>
        <section className="panel boss-section"><div className="panel-heading"><div><h3>Working-day records by state, LGA and LC</h3><p>Source: working_day_records. This monitor does not depend on monthly timesheets.</p></div></div>
          <div className="boss-directory-filters"><label>State<select value={directoryState} onChange={(event) => { setDirectoryState(event.target.value); setDirectoryLga("all"); }}><option value="all">All states</option>{programmeStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label><label>LGA<select value={directoryLga} onChange={(event) => setDirectoryLga(event.target.value)}><option value="all">All LGAs</option>{dayLgaOptions.map((lga) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}</select></label></div>
          {!filteredDays.length ? <p className="boss-empty">No working-day records were submitted for {dateLabel(month)} in this selection. This result is independent of timesheet submission.</p> : <div className="boss-table-wrap"><table className="boss-table"><thead><tr><th>State</th><th>LGA</th><th>LC</th><th>Approved</th><th>Pending</th><th>Returned</th><th>Rejected</th></tr></thead><tbody>{filteredDays.map((row, index) => <tr key={`${row.lga_id}-${row.lc_id ?? "unmatched"}-${index}`}><td>{row.state_name}</td><td>{row.lga_name}</td><td>{row.lc_name ?? "Unmatched or unassigned submitter"}</td><td>{row.approved_days}</td><td>{row.pending_days}</td><td>{row.returned_days}</td><td>{row.rejected_days}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel boss-section"><h3>State totals</h3><div className="boss-state-cards">{states.map((state) => <article className="boss-state-card boss-state-summary" key={state.code}><span>{state.configured ? state.code : "NOT CONFIGURED"}</span><strong>{state.name}</strong><small>Approved: {countLabel(state.verified_working_days)} · Pending: {countLabel(state.pending_working_days)}</small><small>Returned: {countLabel(state.returned_working_days)} · Rejected: {countLabel(state.rejected_working_days)}</small></article>)}</div></section>
      </>}

      {view === "comparisons" && <section className="panel boss-section"><div className="panel-heading"><div><h3>LGA operational comparisons</h3><p>Aggregate counts only; no personal records are exposed.</p></div><label>Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="task_completed">Tasks completed</option><option value="working_days_approved">Approved working days</option><option value="campaign_checkins">Campaign check-ins</option></select></label></div>
        {!orderedComparisons.length ? <p className="boss-empty">No comparison rows were returned.</p> : <div className="boss-table-wrap"><table className="boss-table"><thead><tr><th>State</th><th>LGA</th><th>Tasks complete / total</th><th>Approved working days</th><th>Check-ins</th><th>Readiness reports</th></tr></thead><tbody>{orderedComparisons.map((row) => <tr key={row.lga_id}><td>{row.state_name}</td><td>{row.lga_name}</td><td>{row.task_completed} / {row.task_total}</td><td>{row.working_days_approved}</td><td>{row.campaign_checkins}</td><td>{row.readiness_reports}</td></tr>)}</tbody></table></div>}
      </section>}

      {view === "archive" && <section className="panel boss-section"><div className="panel-heading"><div><h3>Approved report archive</h3><p>Only approved report records are returned from the Boss reporting RPC.</p></div></div>
        {!archive.length ? <p className="boss-empty">No approved reports are available.</p> : <div className="boss-report-list">{archive.map((report) => <article key={report.report_id}><div><strong>{report.state_name}{report.lga_name ? ` · ${report.lga_name}` : ""} — {report.report_type.replaceAll("_", " ")}</strong><span>Period: {report.period_start} to {report.period_end}</span><span>Reviewed: {report.reviewed_at ? new Date(report.reviewed_at).toLocaleString() : "—"}</span><p>{contentText(report.content ?? {})}</p></div><span className="status-badge approved">{report.status}</span></article>)}</div>}
      </section>}
    </>}
    {!loading && error && (view === "overview" || view === "state") && <section className="panel boss-section"><div className="panel-heading"><div><h3>Programme state directory</h3><p>Directory names are available; operational data is unavailable until the Boss reporting contract is installed.</p></div></div><div className="boss-state-cards">{programmeStates.map((state) => <article className="boss-state-card boss-state-summary" key={state.code}><span>OPERATIONAL DATA UNAVAILABLE</span><strong>{state.name}</strong><small>No operational figures are shown.</small></article>)}</div></section>}
    <div className="boss-boundary-note"><strong>Access boundary:</strong> read-only Boss reporting RPCs return the fields needed by this workspace. Boss has no direct access to operational or contact tables.</div>
  </div>;
}

function StateDrilldown({ month, state, detail, stateLcs, stateScs, stateSeniors, selectedLga, selectedLc, selectedLgaId, selectedLcId, onBack, onBackLga, onLga, onLc }: {
  month: string;
  state: ReturnType<typeof mergeProgrammeStates>[number] | undefined; detail: StateDetail | null;
  stateLcs: Person[]; stateScs: Person[]; stateSeniors: Person[]; selectedLga: StateDetail["lgas"][number] | undefined;
  selectedLc: Person | undefined; selectedLgaId: string | null; selectedLcId: string | null;
  onBack: () => void; onBackLga: () => void; onLga: (id: string) => void; onLc: (id: string) => void;
}) {
  return <section className="panel boss-section boss-state-detail">
    <div className="panel-heading"><div><span className="eyebrow">STATE → LGA → LC</span><h3>{state?.name ?? "Selected state"}</h3><p>{detail ? `${detail.state.registered_lgas} registered LGAs · ${detail.state.lga_coordinators} LCs · ${detail.state.state_coordinators} SCs · ${detail.state.senior_supervisors} Senior Supervisors` : "Loading state details…"}</p></div><button type="button" className="secondary-button" onClick={onBack}>Back to all states</button></div>
    {!state?.configured ? <p className="boss-empty">This state has no database record. No personnel or operational totals are available.</p> : detail && <>
      <div className="boss-state-supervisors"><StaffGroup title="State Coordinators" people={stateScs} /><StaffGroup title="Senior Supervisors" people={stateSeniors} /></div>
      {!selectedLgaId ? <div className="boss-state-cards">{detail.lgas.map((lga) => <button type="button" className="boss-state-card" key={lga.lga_id} onClick={() => onLga(lga.lga_id)}><span>{lga.lga_coordinators} ASSIGNED LCs</span><strong>{lga.lga_name}</strong><small>Verified {lga.verified_working_days} · Pending {lga.pending_working_days} · Returned {lga.returned_working_days} · Rejected {lga.rejected_working_days}</small></button>)}</div>
        : <>
          <button type="button" className="boss-back-link" onClick={onBackLga}>Back to {state?.name ?? "state"} LGAs</button>
          <article className="boss-selected-lga"><div><span className="eyebrow">SELECTED LOCAL GOVERNMENT</span><h4>{selectedLga?.lga_name ?? "LGA"}</h4><p>Working days · verified {selectedLga?.verified_working_days ?? 0} · pending {selectedLga?.pending_working_days ?? 0} · returned {selectedLga?.returned_working_days ?? 0} · rejected {selectedLga?.rejected_working_days ?? 0}</p></div>
            {!stateLcs.filter((person) => person.lga_id === selectedLgaId).length ? <p className="boss-empty">No LGA Coordinator profiles are assigned here.</p> : <div className="boss-lc-list">{stateLcs.filter((person) => person.lga_id === selectedLgaId).map((person) => <button type="button" key={person.person_id} className={selectedLcId === person.person_id ? "selected" : ""} onClick={() => onLc(person.person_id)}><strong>{person.full_name}</strong><span>{person.verified_working_days} approved days · {contactLabel(person.email)}</span></button>)}</div>}
          </article>
          {selectedLc && <dl className="boss-lc-detail"><div><dt>LGA Coordinator</dt><dd>{selectedLc.full_name}</dd></div><div><dt>Assigned LGA</dt><dd>{selectedLc.lga_name ?? "Not assigned"}</dd></div><div><dt>Verified days · {dateLabel(month)}</dt><dd>{selectedLc.verified_working_days}</dd></div><div><dt>Email</dt><dd>{contactLabel(selectedLc.email)}</dd></div><div><dt>Phone</dt><dd>{contactLabel(selectedLc.phone_number)}</dd></div></dl>}
        </>}
      {!detail.lgas.length && <p className="boss-empty">No LGA records are configured under this state.</p>}
      {stateLcs.length === 0 && <p className="boss-empty">No LGA Coordinator profiles are registered for this state.</p>}
    </>}
  </section>;
}

function StaffGroup({ title, people }: { title: string; people: Person[] }) {
  return <article><h4>{title}</h4>{people.length ? people.map((person) => <p key={person.person_id}><strong>{person.full_name}</strong><span>{contactLabel(person.email)} · {contactLabel(person.phone_number)}</span></p>) : <p className="boss-empty">No registered personnel.</p>}</article>;
}
