"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PlanItem = {
  id: string;
  title: string;
  type: string;
  deliverable: string;
  deadline: string;
  priority: string;
  progress: number;
  status: string;
};

const statusColors: Record<string, string> = {
  Planned: "plan-status-planned",
  Ongoing: "plan-status-ongoing",
  Completed: "plan-status-completed",
  "Returned for revision": "plan-status-returned",
  Cancelled: "plan-status-cancelled",
};

type MyPlansProps = {
  userId: string;
  lgaId: string | null;
};

export default function MyPlans({ userId, lgaId }: MyPlansProps) {
  const [period, setPeriod] = useState<"Weekly" | "Monthly">("Monthly");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const [planStatus, setPlanStatus] = useState("draft");

  const [form, setForm] = useState({
    title: "",
    type: "Operational task",
    deliverable: "",
    deadline: "",
    priority: "Medium",
  });

  const completed = items.filter((item) => item.status === "Completed").length;
  const ongoing = items.filter((item) => item.status === "Ongoing").length;
  const planned = items.filter((item) => item.status === "Planned").length;
  const returned = items.filter((item) => item.status === "Returned for revision").length;

  const filteredItems = filter === "All"
    ? items
    : items.filter((item) => item.status === filter);

  const supabase = createClient();

  async function loadPlanStatus() {
    if (!lgaId) return;

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const toDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    if (period === "Monthly") {
      const { data, error } = await supabase
        .from("monthly_plans")
        .select("status")
        .eq("lga_id", lgaId)
        .eq("plan_month", toDate(monthStart))
        .maybeSingle();

      if (error) {
        setNotice("Unable to load plan status: " + error.message);
        return;
      }

      setPlanStatus(data?.status || "draft");
    } else {
      const { data, error } = await supabase
        .from("weekly_plans")
        .select("status")
        .eq("lga_id", lgaId)
        .eq("week_start", toDate(weekStart))
        .maybeSingle();

      if (error) {
        setNotice("Unable to load plan status: " + error.message);
        return;
      }

      setPlanStatus(data?.status || "draft");
    }
  }
  async function loadPlanItems() {
    if (!lgaId) {
      setNotice("Your profile is not linked to an LGA.");
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, expected_deliverable, deadline, priority, progress_percent, status, source")
      .eq("lga_id", lgaId)
      .order("created_at", { ascending: false });

    if (error) {
      setNotice("Unable to load plan activities: " + error.message);
      return;
    }

    const mappedItems: PlanItem[] = (data || []).map((task) => ({
      id: task.id,
      title: task.title,
      type: task.source === "official_library"
        ? "Official responsibility"
        : "Operational task",
      deliverable: task.expected_deliverable,
      deadline: task.deadline || "",
      priority: task.priority >= 5
        ? "Urgent"
        : task.priority === 4
          ? "High"
          : task.priority === 2
            ? "Low"
            : "Medium",
      progress: task.progress_percent,
      status: task.status === "ongoing"
        ? "Ongoing"
        : task.status === "completed"
          ? "Completed"
          : task.status === "returned_for_revision"
            ? "Returned for revision"
            : task.status === "cancelled"
              ? "Cancelled"
              : "Planned",
    }));

    setItems(mappedItems);
  }

  useEffect(() => {
    loadPlanItems();
    loadPlanStatus();
  }, [lgaId, period]);
  function updateForm(field: string, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function resetForm() {
    setForm({
      title: "",
      type: "Operational task",
      deliverable: "",
      deadline: "",
      priority: "Medium",
    });
    setEditingId(null);
    setShowForm(false);
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!lgaId) {
      setNotice("Your profile is not linked to an LGA.");
      return;
    }

    if (!form.title.trim() || !form.deliverable.trim() || !form.deadline) {
      setNotice("Please complete all required fields.");
      return;
    }

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - ((day + 6) % 7));

    const toDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    const { data: monthlyPlan, error: monthlyError } = await supabase
      .from("monthly_plans")
      .upsert(
        {
          lga_id: lgaId,
          plan_month: toDate(monthStart),
          submitted_by: userId,
        },
        { onConflict: "lga_id,plan_month", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (monthlyError) {
      setNotice("Monthly plan error: " + monthlyError.message);
      return;
    }

    let monthlyPlanId = monthlyPlan?.id;

    if (!monthlyPlanId) {
      const { data: existingMonthly, error } = await supabase
        .from("monthly_plans")
        .select("id")
        .eq("lga_id", lgaId)
        .eq("plan_month", toDate(monthStart))
        .single();

      if (error || !existingMonthly) {
        setNotice("Unable to find or create monthly plan: " + (error?.message || "Unknown error"));
        return;
      }

      monthlyPlanId = existingMonthly.id;
    }

    const { data: weeklyPlan, error: weeklyError } = await supabase
      .from("weekly_plans")
      .upsert(
        {
          monthly_plan_id: monthlyPlanId,
          lga_id: lgaId,
          week_start: toDate(weekStart),
          submitted_by: userId,
        },
        { onConflict: "lga_id,week_start", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (weeklyError) {
      setNotice("Weekly plan error: " + weeklyError.message);
      return;
    }

    let weeklyPlanId = weeklyPlan?.id;

    if (!weeklyPlanId) {
      const { data: existingWeekly, error } = await supabase
        .from("weekly_plans")
        .select("id")
        .eq("lga_id", lgaId)
        .eq("week_start", toDate(weekStart))
        .single();

      if (error || !existingWeekly) {
        setNotice("Unable to find or create weekly plan: " + (error?.message || "Unknown error"));
        return;
      }

      weeklyPlanId = existingWeekly.id;
    }

    const priorityMap: Record<string, number> = {
      Low: 2,
      Medium: 3,
      High: 4,
      Urgent: 5,
    };

    const taskPayload = {
      weekly_plan_id: weeklyPlanId,
      lga_id: lgaId,
      source: "custom_operational",
      title: form.title.trim(),
      expected_deliverable: form.deliverable.trim(),
      planned_date: toDate(today),
      deadline: form.deadline,
      priority: priorityMap[form.priority] ?? 3,
      created_by: userId,
      updated_by: userId,
    };

    let saveError;

    if (editingId) {
      const result = await supabase
        .from("tasks")
        .update({ ...taskPayload, updated_by: userId })
        .eq("id", editingId)
        .eq("lga_id", lgaId);

      saveError = result.error;
    } else {
      const result = await supabase
        .from("tasks")
        .insert(taskPayload);

      saveError = result.error;
    }

    if (saveError) {
      setNotice("Unable to save activity: " + saveError.message);
      return;
    }

    await loadPlanItems();
    setNotice(editingId ? "Activity updated successfully." : "Activity saved successfully.");
    resetForm();
  }

  function editItem(item: PlanItem) {
    setForm({
      title: item.title,
      type: item.type,
      deliverable: item.deliverable,
      deadline: item.deadline,
      priority: item.priority,
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function updateProgress(id: string, progress: number) {
    const newStatus =
      progress === 100 ? "completed" :
      progress > 0 ? "ongoing" : "planned";

    const { error } = await supabase
      .from("tasks")
      .update({
        progress_percent: progress,
        status: newStatus,
        completed_at: progress === 100 ? new Date().toISOString() : null,
        updated_by: userId,
      })
      .eq("id", id)
      .eq("lga_id", lgaId);

    if (error) {
      setNotice("Progress update failed: " + error.message);
      return;
    }

    await loadPlanItems();
    setNotice("Progress saved. Completion still requires supervisor verification.");
  }

  async function submitPlan() {
    if (!lgaId) {
      setNotice("Your profile is not linked to an LGA.");
      return;
    }

    if (items.length === 0) {
      setNotice("Add at least one activity before submitting this plan.");
      return;
    }

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const toDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    const table = period === "Monthly" ? "monthly_plans" : "weekly_plans";
    const dateColumn = period === "Monthly" ? "plan_month" : "week_start";
    const planDate = period === "Monthly" ? toDate(monthStart) : toDate(weekStart);

    const { data: plan, error: findError } = await supabase
      .from(table)
      .select("id, status")
      .eq("lga_id", lgaId)
      .eq(dateColumn, planDate)
      .maybeSingle();

    if (findError || !plan) {
      setNotice("Unable to find this plan: " + (findError?.message || "Save an activity first."));
      return;
    }

    if (plan.status === "approved") {
      setNotice("This plan has already been approved and cannot be submitted again.");
      return;
    }

    const { data: updatedPlan, error: updateError } = await supabase
      .from(table)
      .update({
        status: "submitted",
        submitted_by: userId,
      })
      .eq("id", plan.id)
      .eq("lga_id", lgaId)
      .select("id, status")
      .maybeSingle();

    if (updateError) {
      setNotice("Plan submission failed: " + updateError.message);
      return;
    }

    if (!updatedPlan) {
      setNotice("Submission blocked: Supabase did not update the plan. Check your database UPDATE permissions and RLS policies.");
      return;
    }

    setPlanStatus(updatedPlan.status);
    setNotice(period + " plan submitted successfully for supervisor review.");
  }

  return (
    <div className="plans-module">
      <div className="plans-toolbar">
        <div className="period-switch">
          <button
            className={period === "Weekly" ? "period-active" : ""}
            onClick={() => setPeriod("Weekly")}
          >
            Weekly plan
          </button>
          <button
            className={period === "Monthly" ? "period-active" : ""}
            onClick={() => setPeriod("Monthly")}
          >
            Monthly plan
          </button>
        </div>

        <button className="primary-button plans-add-button" onClick={() => {
          setEditingId(null);
          setForm({
            title: "",
            type: "Operational task",
            deliverable: "",
            deadline: "",
            priority: "Medium",
          });
          setShowForm(true);
        }}>
          + Add activity
        </button>
      </div>

      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>Ã—</button>
        </div>
      )}

      <div className="plan-period-heading">
        <div>
          <span className="eyebrow">{lgaId ? "LOCAL GOVERNMENT AREA" : "LGA NOT ASSIGNED"}</span>
          <h2>{period} Work Plan</h2>
          <p>
            {period === "Monthly"
              ? `${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · Monthly operational activities`
              : `Week commencing ${new Date(new Date().setDate(new Date().getDate() - ((new Date().getDay() + 6) % 7))).toLocaleDateString("en-GB")} · Weekly operational activities`}
          </p>
        </div>
        <span className="plan-draft-badge">{planStatus.replace("_", " ").toUpperCase()}</span>
      </div>

      <div className="plan-summary-grid">
        <article className="plan-summary-card">
          <span>Total activities</span>
          <strong>{items.length}</strong>
          <small>Activities in this plan</small>
        </article>
        <article className="plan-summary-card">
          <span>Completed</span>
          <strong>{completed}</strong>
          <small>Awaiting verification where applicable</small>
        </article>
        <article className="plan-summary-card">
          <span>Ongoing</span>
          <strong>{ongoing}</strong>
          <small>Currently in progress</small>
        </article>
        <article className="plan-summary-card">
          <span>Not started</span>
          <strong>{planned}</strong>
          <small>Planned activities</small>
        </article>
      </div>

      <section className="plan-review-banner">
        <div>
          <strong>Supervisor review</strong>
          <p>Activities are saved in the system. Submit this plan when it is ready for supervisor review.</p>
        </div>
        <span className="review-pending">{planStatus === "approved" ? "Approved" : planStatus === "submitted" ? "Awaiting supervisor review" : planStatus === "returned" ? "Returned for revision" : "Not submitted"}</span>
      </section>

      <section className="panel plan-table-panel">
        <div className="panel-heading plan-list-heading">
          <div>
            <h3>Planned activities</h3>
            <p>Manage your deliverables, deadlines and progress</p>
          </div>
          <select
            className="plan-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {["All", "Planned", "Ongoing", "Completed", "Returned for revision", "Cancelled"].map((value) => (
              <option key={value} value={value}>{value === "All" ? "All statuses" : value}</option>
            ))}
          </select>
        </div>

        {items.length === 0 ? (
          <div className="plan-empty">
            <strong>No activities yet</strong>
            <p>Add your first activity to begin building this plan.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="plan-empty">
            <strong>No matching activities</strong>
            <p>Try changing the status filter.</p>
          </div>
        ) : (
          <div className="plan-activity-list">
            {filteredItems.map((item) => (
              <article className="plan-activity" key={item.id}>
                <div className="plan-activity-top">
                  <div className="plan-activity-main">
                    <span className="plan-type-label">{item.type}</span>
                    <h4>{item.title}</h4>
                    <p>{item.deliverable}</p>
                  </div>
                  <span className={`plan-status ${statusColors[item.status]}`}>
                    {item.status}
                  </span>
                </div>

                <div className="plan-activity-meta">
                  <span>â—· Deadline: {item.deadline || "Not set"}</span>
                  <span className={`priority priority-${item.priority.toLowerCase()}`}>
                    {item.priority} priority
                  </span>
                </div>

                <div className="plan-progress-heading">
                  <span>Progress</span>
                  <strong>{item.progress}%</strong>
                </div>
                <div className="plan-progress-track">
                  <div
                    className="plan-progress-fill"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>

                <div className="plan-activity-actions">
                  <label>
                    Update progress
                    <select
                      value={item.progress}
                      onChange={(event) => updateProgress(item.id, Number(event.target.value))}
                    >
                      {[...new Set([0, 25, 50, 65, 75, 100, item.progress])].sort((a, b) => a - b).map((value) => (
                        <option key={value} value={value}>{value}%</option>
                      ))}
                    </select>
                  </label>
                  <button className="plan-edit-button" onClick={() => editItem(item)}>
                    Edit activity
                  </button>
                </div>

                {item.status === "Completed" && (
                  <div className="verification-note">
                    Completion reported. Supervisor verification is still required.
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="plan-bottom-summary">
        <div>
          <strong>Plan completion overview</strong>
          <p>{completed} of {items.length} activities marked completed Â· {returned} returned for revision</p>
        </div>
        <button className="primary-button" onClick={submitPlan}>
          Submit plan for review â†’
        </button>
      </div>

      {showForm && (
        <div className="plan-modal-backdrop">
          <section className="plan-modal">
            <div className="plan-modal-heading">
              <div>
                <span className="eyebrow">PLAN MANAGEMENT</span>
                <h2>{editingId !== null ? "Edit activity" : "Add plan activity"}</h2>
              </div>
              <button className="plan-modal-close" onClick={resetForm}>Ã—</button>
            </div>

            <form onSubmit={saveItem}>
              <label className="plan-form-field">
                Activity title *
                <input
                  required
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="Describe the activity"
                />
              </label>

              <label className="plan-form-field">
                Activity type *
                <select
                  value={form.type}
                  onChange={(event) => updateForm("type", event.target.value)}
                >
                  <option>Official responsibility</option>
                  <option>Operational task</option>
                  <option>Custom activity</option>
                </select>
              </label>

              <label className="plan-form-field">
                Expected deliverable *
                <textarea
                  required
                  rows={3}
                  value={form.deliverable}
                  onChange={(event) => updateForm("deliverable", event.target.value)}
                  placeholder="What should be delivered?"
                />
              </label>

              <div className="plan-form-row">
                <label className="plan-form-field">
                  Deadline *
                  <input
                    type="date"
                    required
                    value={form.deadline}
                    onChange={(event) => updateForm("deadline", event.target.value)}
                  />
                </label>

                <label className="plan-form-field">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) => updateForm("priority", event.target.value)}
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </label>
              </div>

              <div className="plan-form-note">
                Activities displayed here are loaded from your LGA records.
              </div>

              <div className="plan-form-actions">
                <button type="button" className="plan-cancel-button" onClick={resetForm}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  {editingId !== null ? "Save changes" : "Add activity"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
