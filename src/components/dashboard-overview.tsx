"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DashboardCounts = {
  activePlans: number;
  completedTasks: number;
  pendingReviews: number;
  reportsSubmitted: number;
};

const initialCounts: DashboardCounts = {
  activePlans: 0,
  completedTasks: 0,
  pendingReviews: 0,
  reportsSubmitted: 0,
};

export default function DashboardOverview({
  lgaId,
}: {
  lgaId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState(initialCounts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!lgaId) {
        setError("Your account is not linked to an LGA.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [
          activePlans,
          completedTasks,
          monthlyPending,
          weeklyPending,
          reportsSubmitted,
        ] = await Promise.all([
          supabase.from("monthly_plans")
            .select("id", { count: "exact", head: true })
            .eq("lga_id", lgaId)
            .eq("status", "approved"),

          supabase.from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("lga_id", lgaId)
            .eq("status", "completed"),

          supabase.from("monthly_plans")
            .select("id", { count: "exact", head: true })
            .eq("lga_id", lgaId)
            .eq("status", "submitted"),

          supabase.from("weekly_plans")
            .select("id", { count: "exact", head: true })
            .eq("lga_id", lgaId)
            .eq("status", "submitted"),

          supabase.from("reports")
            .select("id", { count: "exact", head: true })
            .eq("lga_id", lgaId)
            .in("status", ["submitted", "approved", "shared"]),
        ]);

        const results = [
          activePlans,
          completedTasks,
          monthlyPending,
          weeklyPending,
          reportsSubmitted,
        ];

        const failed = results.find((result) => result.error);

        if (failed?.error) {
          throw new Error(failed.error.message);
        }

        if (!active) return;

        setCounts({
          activePlans: activePlans.count ?? 0,
          completedTasks: completedTasks.count ?? 0,
          pendingReviews:
            (monthlyPending.count ?? 0) + (weeklyPending.count ?? 0),
          reportsSubmitted: reportsSubmitted.count ?? 0,
        });
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load dashboard statistics."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [lgaId, supabase]);

  const cards = [
    {
      label: "Active plans",
      value: counts.activePlans,
      note: "Approved monthly plans",
    },
    {
      label: "Tasks completed",
      value: counts.completedTasks,
      note: "Completed operational tasks",
    },
    {
      label: "Pending reviews",
      value: counts.pendingReviews,
      note: "Monthly and weekly plans awaiting review",
    },
    {
      label: "Reports submitted",
      value: counts.reportsSubmitted,
      note: "Submitted, approved and shared reports",
    },
  ];

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Operational overview</h2>
          <p>
            Live operational figures for your Local Government Area.
          </p>
        </div>
        <span className="live-label">
          {loading ? "UPDATING" : error ? "DATA ERROR" : "LIVE DATA"}
        </span>
      </div>

      {error && (
        <div className="plans-notice" role="alert">
          Dashboard data could not be loaded: {error}
        </div>
      )}

      <section className="stats-grid">
        {cards.map((card) => (
          <article className="stat-card" key={card.label}>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">
              {loading ? "..." : error ? "—" : card.value}
            </div>
            <div className="stat-note">
              {error ? "Check database access and permissions" : card.note}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}