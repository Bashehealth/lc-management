"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "state_coordinator" | "senior_supervisor";
type PlanStatus = "draft" | "submitted" | "returned" | "approved";

type ActivityComment = {
  id: string;
  author_id: string;
  author_role: string;
  body: string;
  addressed_to_role: string | null;
  created_at: string;
  author_name: string;
};

type Activity = {
  id: string;
  title: string;
  activity_description: string | null;
  expected_deliverable: string | null;
  planned_date: string | null;
  week_start: string | null;
  status: string;
  progress_percent: number;
  comments: ActivityComment[];
};

type Plan = {
  id: string;
  lgaName: string;
  coordinator: string;
  type: string;
  period: string;
  status: PlanStatus;
  createdAt: string;
  reviewNote: string | null;
  activities: Activity[];
};

type Props = {
  userId: string;
  role: Role;
};

export default function PlansTasksManagement({ userId, role }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("submitted");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentRecipients, setCommentRecipients] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const [monthly, weekly, lgas, profiles] = await Promise.all([
        supabase.from("monthly_plans").select(
          "id,lga_id,plan_month,status,submitted_by,created_at,review_note"
        ).order("created_at", { ascending: false }),
        supabase.from("weekly_plans").select(
          "id,monthly_plan_id,lga_id,week_start,status,submitted_by,created_at,review_note"
        ).order("created_at", { ascending: false }),
        supabase.from("lgas").select("id,name"),
        supabase.from("profiles").select("id,full_name"),
      ]);

      if (monthly.error) throw monthly.error;
      if (weekly.error) throw weekly.error;
      if (lgas.error) throw lgas.error;
      if (profiles.error) throw profiles.error;

      const lgaMap = new Map((lgas.data ?? []).map(x => [x.id, x.name]));
      const profileMap = new Map((profiles.data ?? []).map(x => [x.id, x.full_name]));

      const weeklyIds = (weekly.data ?? []).map(x => x.id);
      let activityRows: any[] = [];
      let commentRows: any[] = [];

      if (weeklyIds.length) {
        const activitiesResult = await supabase
          .from("tasks")
          .select("id,weekly_plan_id,title,activity_description,expected_deliverable,planned_date,status,progress_percent")
          .in("weekly_plan_id", weeklyIds);

        if (activitiesResult.error) throw activitiesResult.error;
        activityRows = activitiesResult.data ?? [];

        const taskIds = activityRows.map(x => x.id);

        if (taskIds.length) {
          const commentsResult = await supabase
            .from("task_comments")
            .select("id,task_id,author_id,author_role,body,addressed_to_role,created_at")
            .in("task_id", taskIds)
            .order("created_at", { ascending: true });

          if (commentsResult.error) throw commentsResult.error;
          commentRows = commentsResult.data ?? [];
        }
      }

      const activitiesByWeek = new Map<string, Activity[]>();

      for (const item of activityRows) {
        const activityComments: ActivityComment[] = commentRows
          .filter(comment => comment.task_id === item.id)
          .map(comment => ({
            ...comment,
            author_name: profileMap.get(comment.author_id) ?? "Unknown user",
          }));

        const activity: Activity = {
          id: item.id,
          title: item.title,
          activity_description: item.activity_description,
          expected_deliverable: item.expected_deliverable,
          planned_date: item.planned_date,
          week_start: (weekly.data ?? []).find(w => w.id === item.weekly_plan_id)?.week_start ?? null,
          status: item.status,
          progress_percent: item.progress_percent ?? 0,
          comments: activityComments,
        };

        const existing = activitiesByWeek.get(item.weekly_plan_id) ?? [];
        existing.push(activity);
        activitiesByWeek.set(item.weekly_plan_id, existing);
      }

      const monthlyRows: Plan[] = (monthly.data ?? []).map(x => ({
        id: x.id,
        lgaName: lgaMap.get(x.lga_id) ?? "Unknown LGA",
        coordinator: profileMap.get(x.submitted_by) ?? "Unknown coordinator",
        type: "Monthly",
        period: x.plan_month,
        status: x.status,
        createdAt: x.created_at,
        reviewNote: x.review_note,
        activities: (weekly.data ?? [])
          .filter(w => w.monthly_plan_id === x.id)
          .flatMap(w => activitiesByWeek.get(w.id) ?? []),
      }));

      const weeklyRows: Plan[] = (weekly.data ?? []).map(x => ({
        id: x.id,
        lgaName: lgaMap.get(x.lga_id) ?? "Unknown LGA",
        coordinator: profileMap.get(x.submitted_by) ?? "Unknown coordinator",
        type: "Weekly",
        period: x.week_start,
        status: x.status,
        createdAt: x.created_at,
        reviewNote: x.review_note,
        activities: activitiesByWeek.get(x.id) ?? [],
      }));

      setPlans(
        [...monthlyRows, ...weeklyRows].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load plans and activities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  async function reviewPlan(plan: Plan, decision: "approved" | "returned") {
    if (role !== "state_coordinator") {
      setError("Only the State Coordinator can review plans.");
      return;
    }

    if (plan.status !== "submitted") {
      setError("This plan is no longer awaiting review.");
      return;
    }

    const note = reviewNotes[plan.id]?.trim() ?? "";

    if (decision === "returned" && !note) {
      setError("A reason is required when returning a plan.");
      return;
    }

    setSavingId(plan.id);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();
      const table = plan.type === "Monthly" ? "monthly_plans" : "weekly_plans";

      const { data, error: updateError } = await supabase
        .from(table)
        .update({
          status: decision,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_note: note || null,
        })
        .eq("id", plan.id)
        .eq("status", "submitted")
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!data) throw new Error("No record was updated. The plan may already have been reviewed.");

      setNotice(decision === "approved"
        ? `${plan.lgaName} plan approved successfully.`
        : `${plan.lgaName} plan returned for correction.`);

      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save review decision.");
    } finally {
      setSavingId(null);
    }
  }

  async function addActivityComment(activity: Activity) {
    if (role !== "senior_supervisor") {
      setError("Activity commenting is currently reserved for Senior Supervisors.");
      return;
    }

    const body = commentDrafts[activity.id]?.trim() ?? "";
    const recipient = commentRecipients[activity.id];

    if (!body) {
      setError("Write a comment before submitting.");
      return;
    }

    if (!["lga_coordinator", "state_coordinator"].includes(recipient)) {
      setError("Choose whether the comment is addressed to the LGA Coordinator or State Coordinator.");
      return;
    }

    setSavingCommentId(activity.id);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();

      const { error: insertError } = await supabase
        .from("task_comments")
        .insert({
          task_id: activity.id,
          author_id: userId,
          author_role: role,
          body,
          addressed_to_role: recipient,
        });

      if (insertError) throw insertError;

      setCommentDrafts(previous => ({ ...previous, [activity.id]: "" }));
      setNotice("Activity comment saved successfully.");
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save activity comment.");
    } finally {
      setSavingCommentId(null);
    }
  }

  const visiblePlans = plans.filter(plan => filter === "all" || plan.status === filter);
  const pending = plans.filter(x => x.status === "submitted").length;
  const approved = plans.filter(x => x.status === "approved").length;
  const returned = plans.filter(x => x.status === "returned").length;

  return (
    <div className="plans-management-module">
      {notice && (
        <div className="plans-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {error && (
        <div className="plans-notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      )}

      <div className="plans-management-heading">
        <div>
          <span className="eyebrow">STATEWIDE SUPERVISION · 17 LGAs</span>
          <h2>Plans &amp; Tasks Management</h2>
          <p>{role === "state_coordinator"
            ? "Review plans submitted by LGA Coordinators."
            : "Monitor statewide plans and provide activity-level feedback."}</p>
        </div>
        <span className="live-label">LIVE DATABASE</span>
      </div>

      <div className="plans-management-summary">
        <article className="plan-summary-card"><span>Pending review</span><strong>{pending}</strong></article>
        <article className="plan-summary-card"><span>Approved</span><strong>{approved}</strong></article>
        <article className="plan-summary-card"><span>Returned</span><strong>{returned}</strong></article>
        <article className="plan-summary-card"><span>Total plans</span><strong>{plans.length}</strong></article>
      </div>

      <section className="panel plans-management-review-panel">
        <div className="panel-heading">
          <div>
            <h3>Plan submission register</h3>
            <p>Monthly and weekly plans from accessible LGAs.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void loadPlans()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="plans-management-tabs">
          {[
            ["submitted", "Pending"],
            ["approved", "Approved"],
            ["returned", "Returned"],
            ["all", "All plans"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? "plans-management-tab-active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="plan-empty"><strong>Loading submissions...</strong></div>
        ) : visiblePlans.length === 0 ? (
          <div className="plan-empty"><strong>No matching submissions</strong></div>
        ) : visiblePlans.map(plan => (
          <article className="plans-management-review-card" key={`${plan.type}-${plan.id}`}>
            <div className="plans-management-assignment-header">
              <div>
                <strong>{plan.lgaName} · {plan.type} Plan</strong>
                <span>Period: {plan.period}</span>
                <span>Coordinator: {plan.coordinator}</span>
              </div>
              <span className={`plan-status ${
                plan.status === "approved" ? "plan-status-completed"
                  : plan.status === "returned" ? "plan-status-returned"
                    : "plan-status-ongoing"
              }`}>{plan.status}</span>
            </div>

            {plan.reviewNote && (
              <div className="plans-management-recorded-comment">
                <strong>Review note</strong><p>{plan.reviewNote}</p>
              </div>
            )}

            {role === "state_coordinator" && plan.status === "submitted" && (
              <div className="plans-management-review-actions">
                <label>
                  <span>Review comment (required when returning)</span>
                  <textarea
                    rows={3}
                    value={reviewNotes[plan.id] ?? ""}
                    onChange={event => setReviewNotes(previous => ({
                      ...previous, [plan.id]: event.target.value,
                    }))}
                    placeholder="Explain your findings or required corrections..."
                  />
                </label>
                <div>
                  <button type="button" className="secondary-button" disabled={savingId === plan.id}
                    onClick={() => void reviewPlan(plan, "returned")}>
                    {savingId === plan.id ? "Saving..." : "Return for correction"}
                  </button>
                  <button type="button" className="primary-button" disabled={savingId === plan.id}
                    onClick={() => void reviewPlan(plan, "approved")}>
                    {savingId === plan.id ? "Saving..." : "Approve plan"}
                  </button>
                </div>
              </div>
            )}

            {(plan.type === "Weekly" || plan.activities.length > 0) && (
              <div className="plans-management-activities">
                <h4>Planned activities ({plan.activities.length})</h4>

                {plan.activities.length === 0 ? (
                  <p>No activities recorded in this weekly plan.</p>
                ) : plan.activities.map(activity => (
                  <div className="plans-management-activity" key={activity.id}>
                    <button
                      type="button"
                      className="plans-management-activity-toggle"
                      onClick={() => setExpandedActivity(
                        expandedActivity === activity.id ? null : activity.id
                      )}
                    >
                      <span>
                        <strong>{activity.title}</strong>
                        <small>{plan.type === "Monthly" && activity.week_start ? `Week of ${activity.week_start} · ` : ""}{activity.planned_date ?? "Date not specified"} · {activity.status} · {activity.progress_percent}%</small>
                      </span>
                      <span>{expandedActivity === activity.id ? "−" : "+"}</span>
                    </button>

                    {expandedActivity === activity.id && (
                      <div className="plans-management-activity-detail">
                        {activity.activity_description && (
                          <p><strong>Description:</strong> {activity.activity_description}</p>
                        )}
                        {activity.expected_deliverable && (
                          <p><strong>Expected deliverable:</strong> {activity.expected_deliverable}</p>
                        )}

                        <div className="plans-management-activity-comments">
                          <h5>Activity comments ({activity.comments.length})</h5>

                          {activity.comments.length === 0 ? (
                            <p>No comments recorded yet.</p>
                          ) : activity.comments.map(comment => (
                            <div className="plans-management-activity-comment" key={comment.id}>
                              <strong>{comment.author_name} · {comment.author_role.replaceAll("_", " ")}</strong>
                              <p>{comment.body}</p>
                              <small>
                                Addressed to: {comment.addressed_to_role
                                  ? comment.addressed_to_role.replaceAll("_", " ")
                                  : "Not specified"} · {new Date(comment.created_at).toLocaleString("en-GB")}
                              </small>
                            </div>
                          ))}

                          {role === "senior_supervisor" && (
                            <div className="plans-management-review-actions">
                              <label>
                                <span>Address comment to</span>
                                <select
                                  value={commentRecipients[activity.id] ?? ""}
                                  onChange={event => setCommentRecipients(previous => ({
                                    ...previous, [activity.id]: event.target.value,
                                  }))}
                                >
                                  <option value="">Choose recipient</option>
                                  <option value="lga_coordinator">LGA Coordinator</option>
                                  <option value="state_coordinator">State Coordinator</option>
                                </select>
                              </label>
                              <label>
                                <span>Your activity comment</span>
                                <textarea
                                  rows={3}
                                  value={commentDrafts[activity.id] ?? ""}
                                  onChange={event => setCommentDrafts(previous => ({
                                    ...previous, [activity.id]: event.target.value,
                                  }))}
                                  placeholder="Write feedback about this activity..."
                                />
                              </label>
                              <button
                                type="button"
                                className="primary-button"
                                disabled={savingCommentId === activity.id}
                                onClick={() => void addActivityComment(activity)}
                              >
                                {savingCommentId === activity.id ? "Saving..." : "Submit comment"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {role === "senior_supervisor" && (
              <p className="checkin-privacy-note">
                Monitoring access only. The State Coordinator makes plan approval decisions.
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
