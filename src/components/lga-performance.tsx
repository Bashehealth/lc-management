"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LgaRow = {
  id: string;
  name: string;
  coordinator_reference_name: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
  lga_id: string | null;
  role: string;
};

type PlanRow = {
  id: string;
  lga_id: string;
  status: string;
};

type TaskRow = {
  id: string;
  lga_id: string;
  title: string;
  status: string;
  progress_percent: number;
  deadline: string | null;
  verified_at: string | null;
};

type WorkingDayRow = {
  id: string;
  lga_id: string;
  working_date: string;
  status: string;
};

type ReportRow = {
  id: string;
  lga_id: string;
  report_type: string;
  status: string;
  period_start: string;
  period_end: string;
};

type ReadinessRow = {
  id: string;
  lga_id: string;
  report_date: string;
  reporting_period: string;
  total_teams: number;
  gts_clear_reinstall_total: number;
  gts_pending: number;
  fionet_installed_total: number;
  fionet_pending: number;
  team_codes_populated: number;
};

type DeviceRow = {
  id: string;
  lga_id: string;
  activity_category: string;
  device_name: string;
  expected_quantity: number;
  completed_quantity: number;
  pending_quantity: number;
  reported_at: string;
};

type VisitRow = {
  id: string;
  lga_id: string;
  campaign_name: string;
  ward: string;
  settlement: string;
  team_code: string;
  visited_at: string;
};

type CheckinRow = {
  id: string;
  lga_id: string;
  checkin_date: string;
  checked_in_at: string;
  reported_location: string | null;
};

type LgaMetrics = {
  plans: number;
  draftPlans: number;
  submittedPlans: number;
  returnedPlans: number;
  approvedPlans: number;
  tasks: number;
  completedTasks: number;
  plannedTasks: number;
  ongoingTasks: number;
  returnedTasks: number;
  overdueTasks: number;
  cancelledTasks: number;
  completionRate: number;
  verifiedTasks: number;
  approvedDays: number;
  readinessReports: number;
  deviceReports: number;
  supervisionVisits: number;
  checkins: number;
  reports: number;
};

const emptyMetrics = (): LgaMetrics => ({
  plans: 0,
  draftPlans: 0,
  submittedPlans: 0,
  returnedPlans: 0,
  approvedPlans: 0,
  tasks: 0,
  completedTasks: 0,
  plannedTasks: 0,
  ongoingTasks: 0,
  returnedTasks: 0,
  overdueTasks: 0,
  cancelledTasks: 0,
  completionRate: 0,
  verifiedTasks: 0,
  approvedDays: 0,
  readinessReports: 0,
  deviceReports: 0,
  supervisionVisits: 0,
  checkins: 0,
  reports: 0,
});

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "Not recorded";

export default function LGAPerformance() {
  const [lgas, setLgas] = useState<LgaRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [workingDays, setWorkingDays] = useState<WorkingDayRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [search, setSearch] = useState("");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [selectedLgaId, setSelectedLgaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const results = await Promise.all([
        supabase.from("lgas")
          .select("id,name,coordinator_reference_name")
          .order("name"),
        supabase.from("profiles")
          .select("id,full_name,lga_id,role")
          .eq("role", "lga_coordinator"),
        supabase.from("monthly_plans")
          .select("id,lga_id,status"),
        supabase.from("tasks")
          .select("id,lga_id,title,status,progress_percent,deadline,verified_at"),
        supabase.from("working_day_records")
          .select("id,lga_id,working_date,status"),
        supabase.from("reports")
          .select("id,lga_id,report_type,status,period_start,period_end"),
        supabase.from("campaign_readiness_reports")
          .select("id,lga_id,report_date,reporting_period,total_teams,gts_clear_reinstall_total,gts_pending,fionet_installed_total,fionet_pending,team_codes_populated"),
        supabase.from("campaign_device_progress")
          .select("id,lga_id,activity_category,device_name,expected_quantity,completed_quantity,pending_quantity,reported_at"),
        supabase.from("supportive_supervision_visits")
          .select("id,lga_id,campaign_name,ward,settlement,team_code,visited_at"),
        supabase.from("campaign_checkins")
          .select("id,lga_id,checkin_date,checked_in_at,reported_location"),
      ]);

      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      setLgas((results[0].data ?? []) as LgaRow[]);
      setProfiles((results[1].data ?? []) as ProfileRow[]);
      setPlans((results[2].data ?? []) as PlanRow[]);
      setTasks((results[3].data ?? []) as TaskRow[]);
      setWorkingDays((results[4].data ?? []) as WorkingDayRow[]);
      setReports((results[5].data ?? []) as ReportRow[]);
      setReadiness((results[6].data ?? []) as ReadinessRow[]);
      setDevices((results[7].data ?? []) as DeviceRow[]);
      setVisits((results[8].data ?? []) as VisitRow[]);
      setCheckins((results[9].data ?? []) as CheckinRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load LGA performance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const metricsFor = (lgaId: string): LgaMetrics => {
    const lgaPlans = plans.filter((x) => x.lga_id === lgaId);
    const lgaTasks = tasks.filter((x) => x.lga_id === lgaId);
    const todayKey = new Date().toLocaleDateString("en-CA");
    const actionableTasks = lgaTasks.filter((x) => x.status !== "cancelled");
    const completedCount = lgaTasks.filter((x) => x.status === "completed").length;

    return {
      plans: lgaPlans.length,
      draftPlans: lgaPlans.filter((x) => x.status === "draft").length,
      submittedPlans: lgaPlans.filter((x) => x.status === "submitted").length,
      returnedPlans: lgaPlans.filter((x) => x.status === "returned").length,
      approvedPlans: lgaPlans.filter((x) => x.status === "approved").length,
      tasks: lgaTasks.length,
      completedTasks: completedCount,
      plannedTasks: lgaTasks.filter((x) => x.status === "planned").length,
      ongoingTasks: lgaTasks.filter((x) => x.status === "ongoing").length,
      returnedTasks: lgaTasks.filter((x) => x.status === "returned_for_revision").length,
      overdueTasks: lgaTasks.filter((x) =>
        Boolean(x.deadline) &&
        x.deadline!.slice(0, 10) < todayKey &&
        !["completed", "cancelled"].includes(x.status)
      ).length,
      cancelledTasks: lgaTasks.filter((x) => x.status === "cancelled").length,
      completionRate: actionableTasks.length
        ? Math.round((completedCount / actionableTasks.length) * 100)
        : 0,
      verifiedTasks: lgaTasks.filter((x) => x.verified_at !== null).length,
      approvedDays: workingDays.filter(
        (x) => x.lga_id === lgaId && x.status === "approved"
      ).length,
      readinessReports: readiness.filter((x) => x.lga_id === lgaId).length,
      deviceReports: devices.filter((x) => x.lga_id === lgaId).length,
      supervisionVisits: visits.filter((x) => x.lga_id === lgaId).length,
      checkins: checkins.filter((x) => x.lga_id === lgaId).length,
      reports: reports.filter((x) =>
        x.lga_id === lgaId &&
        ["submitted", "approved", "shared"].includes(x.status)
      ).length,
    };
  };

  const filteredLgas = lgas.filter((lga) => {
    const coordinator = profiles.find((x) => x.lga_id === lga.id);
    const matchesSearch = `${lga.name} ${coordinator?.full_name ?? ""} ${lga.coordinator_reference_name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const m = metricsFor(lga.id);
    const actionable = tasks.filter(
      (x) => x.lga_id === lga.id && x.status !== "cancelled"
    ).length;

    switch (performanceFilter) {
      case "high-risk": return m.overdueTasks > 0;
      case "low-completion": return actionable > 0 && m.completionRate < 50;
      case "no-tasks": return m.tasks === 0;
      case "best": return actionable > 0;
      default: return true;
    }
  });

  const sortedLgas = performanceFilter === "best"
    ? [...filteredLgas].sort(
        (a, b) => metricsFor(b.id).completionRate - metricsFor(a.id).completionRate
      )
    : filteredLgas;

  const selectedLga = lgas.find((x) => x.id === selectedLgaId);
  const selectedMetrics = selectedLgaId ? metricsFor(selectedLgaId) : null;
  const totalTasks = tasks.length;
  const todayKey = new Date().toLocaleDateString("en-CA");
  const actionableTasks = tasks.filter((x) => x.status !== "cancelled");
  const completedTasks = tasks.filter((x) => x.status === "completed").length;
  const overdueTasks = tasks.filter((x) =>
    Boolean(x.deadline) &&
    x.deadline!.slice(0, 10) < todayKey &&
    !["completed", "cancelled"].includes(x.status)
  ).length;
  const taskCompletionRate = actionableTasks.length
    ? Math.round((completedTasks / actionableTasks.length) * 100)
    : 0;
  const verifiedTasks = tasks.filter((x) => x.verified_at !== null).length;
  const reportingLgas = new Set(
    plans.filter((x) => ["submitted", "approved"].includes(x.status))
      .map((x) => x.lga_id)
  ).size;
  const draftPlansTotal = plans.filter((x) => x.status === "draft").length;
  const submittedPlansTotal = plans.filter((x) => x.status === "submitted").length;
  const returnedPlansTotal = plans.filter((x) => x.status === "returned").length;
  const approvedPlansTotal = plans.filter((x) => x.status === "approved").length;
  const outstandingPlans = submittedPlansTotal;
  const submittedReports = reports.filter((x) =>
    ["submitted", "approved", "shared"].includes(x.status)
  ).length;

  return (
    <div className="lga-performance-module">
      <div className="lga-performance-heading">
        <div>

        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadData()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh data"}
        </button>
      </div>

      {error && <div className="plans-notice" role="alert">{error}</div>}

      <div className="lga-performance-summary">
        <article className="plan-summary-card">
          <span>Total LGAs</span>
          <strong>{loading ? " | ”" : lgas.length}</strong>
          <small>Database directory</small>
        </article>
        <article className="plan-summary-card">
          <span>Plan status breakdown</span>
          <strong>{loading ? " | ”" : plans.length}</strong>
          <small>
            Draft: {draftPlansTotal}  |  Submitted: {submittedPlansTotal}
             |  Returned: {returnedPlansTotal}  |  Approved: {approvedPlansTotal}
          </small>
        </article>
        <article className="plan-summary-card">
          <span>Total tasks</span>
          <strong>{loading ? " | ”" : totalTasks}</strong>
          <small>All recorded tasks across LGAs</small>
        </article>
        <article className="plan-summary-card">
          <span>Task completion rate</span>
          <strong>{loading ? " | ”" : `${taskCompletionRate}%`}</strong>
          <small>{completedTasks} completed  |  {actionableTasks.length} actionable</small>
        </article>
        <article className="plan-summary-card">
          <span>Overdue tasks</span>
          <strong>{loading ? " | ”" : overdueTasks}</strong>
          <small>Past deadline and not completed or cancelled</small>
        </article>
        <article className="plan-summary-card">
          <span>Verified tasks</span>
          <strong>{loading ? " | ”" : verifiedTasks}</strong>
          <small>Tasks with verification records</small>
        </article>
        <article className="plan-summary-card">
          <span>Pending plan reviews</span>
          <strong>{loading ? " | ”" : outstandingPlans}</strong>
          <small>Awaiting State Coordinator decision</small>
        </article>
      </div>

      <section className="panel lga-performance-panel">
        <div className="panel-heading">
          <div>
            <h3>Statewide LGA directory</h3>
            <p>Search an LGA and open its operational records.</p>
          </div>
          <span className="live-label">{lgas.length} LGAs</span>
        </div>

        <div className="lga-performance-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search LGA or Coordinator..."
          />
          <select
            value={performanceFilter}
            onChange={(event) => setPerformanceFilter(event.target.value)}
            aria-label="Filter LGA performance"
          >
            <option value="all">All LGAs</option>
            <option value="high-risk">High risk: overdue tasks</option>
            <option value="low-completion">Low completion: below 50%</option>
            <option value="no-tasks">No tasks recorded</option>
            <option value="best">Ranked by completion rate</option>
          </select>
        </div>

        <div className="lga-performance-table-wrap">
          <table className="lga-performance-table">
            <thead>
              <tr>
                <th>Local Government</th>
                <th>LGA Coordinator</th>
                <th>Plans</th>
                <th>Tasks</th>
                <th>Completion</th>
                <th>Overdue</th>
                <th>Performance</th>
                <th>Approved Days</th>
                <th>Campaign</th>
                <th>Reports</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedLgas.map((lga) => {
                const coordinator = profiles.find((x) => x.lga_id === lga.id);
                const m = metricsFor(lga.id);

                return (
                  <tr key={lga.id}>
                    <td><strong>{lga.name}</strong></td>
                    <td>{coordinator?.full_name ?? lga.coordinator_reference_name ?? "Not assigned"}</td>
                    <td>D:{m.draftPlans}  |  S:{m.submittedPlans}  |  R:{m.returnedPlans}  |  A:{m.approvedPlans}</td>
                    <td>{m.completedTasks}/{m.tasks} completed</td>
                    <td>{m.tasks > 0 ? `${m.completionRate}%` : "N/A"}</td>
                    <td>{m.overdueTasks}</td>
                    <td>
                      {m.tasks === 0
                        ? "No tasks"
                        : m.overdueTasks > 0
                          ? "High risk"
                          : m.completionRate < 50
                            ? "Low completion"
                            : "On track"}
                    </td>
                    <td>{m.approvedDays}</td>
                    <td>{m.readinessReports + m.checkins + m.deviceReports}</td>
                    <td>{m.reports}</td>
                    <td>
                      <button
                        type="button"
                        className="lga-view-button"
                        onClick={() => setSelectedLgaId(lga.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!loading && filteredLgas.length === 0 && (
                <tr>
                  <td colSpan={11} className="lga-performance-empty">
                    {performanceFilter === "high-risk"
                      ? "No LGAs currently have overdue tasks."
                      : performanceFilter === "no-tasks"
                        ? "No LGAs without recorded tasks found."
                        : performanceFilter === "low-completion"
                          ? "No LGAs currently fall below the completion threshold."
                          : performanceFilter === "best"
                            ? "No LGAs have actionable tasks to rank."
                            : "No matching LGA found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedLga && selectedMetrics && (
        <section className="panel lga-detail-panel">
          <div className="panel-heading">
            <div>
              <h3>{selectedLga.name} performance overview</h3>
              <p>
                Coordinator: {profiles.find((x) => x.lga_id === selectedLga.id)?.full_name
                  ?? selectedLga.coordinator_reference_name ?? "Not assigned"}
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelectedLgaId(null)}
            >
              Close
            </button>
          </div>

          <div className="lga-detail-grid">
            <div className="lga-detail-item">
              <span>Monthly plans</span>
              <strong>{selectedMetrics.plans} total</strong>
              <small>
                Draft: {selectedMetrics.draftPlans}  |  Submitted: {selectedMetrics.submittedPlans}
                 |  Returned: {selectedMetrics.returnedPlans}  |  Approved: {selectedMetrics.approvedPlans}
              </small>
            </div>
            <div className="lga-detail-item">
              <span>Total tasks and completion rate</span>
              <strong>{selectedMetrics.tasks} total  |  {selectedMetrics.completionRate}% completed</strong>
            </div>
            <div className="lga-detail-item">
              <span>Completed tasks</span>
              <strong>{selectedMetrics.completedTasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Ongoing tasks</span>
              <strong>{selectedMetrics.ongoingTasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Planned tasks</span>
              <strong>{selectedMetrics.plannedTasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Overdue tasks</span>
              <strong>{selectedMetrics.overdueTasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Returned for revision</span>
              <strong>{selectedMetrics.returnedTasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Cancelled tasks</span>
              <strong>{selectedMetrics.cancelledTasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Verified tasks</span>
              <strong>{selectedMetrics.verifiedTasks} verified of {selectedMetrics.tasks}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Approved working days</span>
              <strong>{selectedMetrics.approvedDays}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Campaign readiness reports</span>
              <strong>{selectedMetrics.readinessReports}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Device progress records</span>
              <strong>{selectedMetrics.deviceReports}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Campaign check-ins</span>
              <strong>{selectedMetrics.checkins}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Supportive supervision visits</span>
              <strong>{selectedMetrics.supervisionVisits}</strong>
            </div>
            <div className="lga-detail-item">
              <span>Submitted reports</span>
              <strong>{selectedMetrics.reports}</strong>
            </div>
          </div>

          <h3>Recent campaign readiness</h3>
          {readiness.filter((x) => x.lga_id === selectedLga.id).length === 0 ? (
            <p>No campaign readiness reports recorded.</p>
          ) : readiness.filter((x) => x.lga_id === selectedLga.id)
            .slice(0, 5).map((item) => (
              <div className="lga-detail-item" key={item.id}>
                <strong>{item.reporting_period || "Campaign readiness"}</strong>
                <span>Reported: {dateLabel(item.report_date)}  |  Teams: {item.total_teams}</span>
                <span>GTS cleared: {item.gts_clear_reinstall_total}  |  GTS pending: {item.gts_pending}</span>
                <span>Fionet installed: {item.fionet_installed_total}  |  Pending: {item.fionet_pending}</span>
                <span>Team codes populated: {item.team_codes_populated}</span>
              </div>
            ))}

          <h3>Recent device progress</h3>
          {devices.filter((x) => x.lga_id === selectedLga.id).length === 0 ? (
            <p>No device progress records recorded.</p>
          ) : devices.filter((x) => x.lga_id === selectedLga.id)
            .slice(0, 5).map((item) => (
              <div className="lga-detail-item" key={item.id}>
                <strong>{item.device_name}</strong>
                <span>{item.activity_category}  |  Reported: {dateLabel(item.reported_at)}</span>
                <span>Expected: {item.expected_quantity}  |  Completed: {item.completed_quantity}  |  Pending: {item.pending_quantity}</span>
              </div>
            ))}

          <h3>Recent supportive supervision visits</h3>
          {visits.filter((x) => x.lga_id === selectedLga.id).length === 0 ? (
            <p>No supportive supervision visits recorded.</p>
          ) : visits.filter((x) => x.lga_id === selectedLga.id)
            .slice(0, 5).map((item) => (
              <div className="lga-detail-item" key={item.id}>
                <strong>{item.campaign_name || "Supervision visit"}</strong>
                <span>{item.ward || "Ward not specified"}  |  {item.settlement || "Settlement not specified"}</span>
                <span>Team: {item.team_code || "Not specified"}  |  Visited: {dateLabel(item.visited_at)}</span>
              </div>
            ))}

          <h3>Recent tasks</h3>
          {tasks.filter((x) => x.lga_id === selectedLga.id).length === 0 ? (
            <p>No tasks recorded.</p>
          ) : tasks.filter((x) => x.lga_id === selectedLga.id)
            .slice(0, 10).map((item) => (
              <div className="lga-detail-item" key={item.id}>
                <strong>{item.title}</strong>
                <span>Status: {item.status.replaceAll("_", " ")}  |  Progress: {item.progress_percent}%</span>
                <span>{item.verified_at ? `Verified: ${dateLabel(item.verified_at)}` : "Not yet verified"}</span>
              </div>
            ))}
        </section>
      )}

      <div className="checkin-privacy-note">
        <strong>Performance integrity</strong>
        <p>
          Completed tasks and verified tasks are counted separately.
          Campaign records represent submitted records, not automatic proof
          of successful implementation. Only approved working-day claims
          are counted as approved days.
        </p>
      </div>
    </div>
  );
}




