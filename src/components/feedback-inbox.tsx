"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "lga_coordinator" | "state_coordinator" | "senior_supervisor";

type Props = {
  userId: string;
  role: Role;
};

type Feedback = {
  id: string;
  body: string;
  author: string;
  authorRole: string;
  recipient: string;
  activity: string;
  lga: string;
  week: string;
  createdAt: string;
};

export default function FeedbackInbox({ userId, role }: Props) {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      let query = supabase
        .from("task_comments")
        .select("id,task_id,author_id,author_role,body,addressed_to_role,created_at")
        .order("created_at", { ascending: false });

      if (role === "senior_supervisor") {
        query = query.eq("author_id", userId);
      } else {
        query = query.eq("addressed_to_role", role);
      }

      const { data: comments, error: commentError } = await query;
      if (commentError) throw commentError;

      const rows = comments ?? [];
      if (!rows.length) {
        setItems([]);
        return;
      }

      const taskIds = [...new Set(rows.map(x => x.task_id))];
      const authorIds = [...new Set(rows.map(x => x.author_id))];

      const [tasksResult, authorsResult] = await Promise.all([
        supabase.from("tasks")
          .select("id,title,weekly_plan_id,lga_id")
          .in("id", taskIds),
        supabase.rpc("get_feedback_author_names", {
          p_comment_ids: rows.map(x => x.id),
        }),
      ]);

      if (tasksResult.error) throw tasksResult.error;
      if (authorsResult.error) throw authorsResult.error;

      const tasks = tasksResult.data ?? [];
      const weeklyIds = [...new Set(tasks.map(x => x.weekly_plan_id).filter(Boolean))];
      const lgaIds = [...new Set(tasks.map(x => x.lga_id).filter(Boolean))];

      const [weeksResult, lgasResult] = await Promise.all([
        weeklyIds.length
          ? supabase.from("weekly_plans")
              .select("id,week_start")
              .in("id", weeklyIds)
          : Promise.resolve({ data: [], error: null }),
        lgaIds.length
          ? supabase.from("lgas")
              .select("id,name")
              .in("id", lgaIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (weeksResult.error) throw weeksResult.error;
      if (lgasResult.error) throw lgasResult.error;

      const taskMap = new Map(tasks.map(x => [x.id, x]));
      const authorMap = new Map<string, string>(
        (authorsResult.data ?? []).map((x: { comment_id: string; author_name: string }) => [
          x.comment_id,
          String(x.author_name ?? "Unknown user"),
        ])
      );
      const weekMap = new Map(
        (weeksResult.data ?? []).map(x => [x.id, x.week_start])
      );
      const lgaMap = new Map(
        (lgasResult.data ?? []).map(x => [x.id, x.name])
      );

      setItems(rows.map(comment => {
        const task = taskMap.get(comment.task_id);

        return {
          id: comment.id,
          body: comment.body,
          author: authorMap.get(comment.id) ?? "Unknown user",
          authorRole: comment.author_role,
          recipient: comment.addressed_to_role ?? "Not specified",
          activity: task?.title ?? "Activity unavailable",
          lga: task ? lgaMap.get(task.lga_id) ?? "Unknown LGA" : "Unavailable",
          week: task ? weekMap.get(task.weekly_plan_id) ?? "" : "",
          createdAt: comment.created_at,
        };
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load feedback.");
    } finally {
      setLoading(false);
    }
  }, [userId, role]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  return (
    <div className="plans-management-module">
      <div className="plans-management-heading">
        <div>
          <span className="eyebrow">OPERATIONAL COMMUNICATION</span>
          <h2>Comments &amp; Feedback</h2>
          <p>
            {role === "senior_supervisor"
              ? "Feedback you have sent to LGA and State Coordinators."
              : "Activity feedback addressed to your role."}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadFeedback()}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && <div className="plans-notice" role="alert">{error}</div>}

      {loading ? (
        <div className="plan-empty">Loading feedback...</div>
      ) : items.length === 0 ? (
        <div className="plan-empty">
          <strong>No feedback found</strong>
          <p>Comments will appear here when they are available to your role.</p>
        </div>
      ) : (
        <>
          <div className="plans-management-summary">
            <article className="plan-summary-card">
              <span>Total feedback</span>
              <strong>{items.length}</strong>
            </article>
          </div>

          {items.map(item => (
            <article className="plans-management-review-card" key={item.id}>
              <div className="plans-management-assignment-header">
                <div>
                  <strong>{item.lga} · {item.activity}</strong>
                  <span>{item.week ? `Week starting ${item.week}` : "Week not available"}</span>
                  <span>From: {item.author} · {item.authorRole.replaceAll("_", " ")}</span>
                </div>
                <span className="plan-status plan-status-ongoing">
                  {item.recipient.replaceAll("_", " ")}
                </span>
              </div>
              <div className="plans-management-recorded-comment">
                <p>{item.body}</p>
                <small>
                  {new Date(item.createdAt).toLocaleString("en-GB")}
                </small>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
