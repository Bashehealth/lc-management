"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type LGA = {
  id: string
  name: string
}

type MonthlyPlan = {
  id: string
  lga_id: string
  plan_month: string
  status: string
  review_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

type Task = {
  id: string
  lga_id: string
  title: string
  status: string
  deadline: string | null
  progress_percent: number | null
}

type AttentionRow = {
  id: string
  name: string
  planStatus: string
  overdueCount: number
  reasons: string[]
  actions: string[]
  hasAttention: boolean
}

type Metrics = {
  activePlans: number
  completedTasks: number
  pendingReviews: number
  submittedReports: number
}

const initialMetrics: Metrics = {
  activePlans: 0,
  completedTasks: 0,
  pendingReviews: 0,
  submittedReports: 0,
}

function localDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function planLabel(status: string | undefined) {
  if (!status) return "No monthly plan"
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    returned: "Returned",
    approved: "Approved",
  }
  return labels[status] || status
}

export default function StateCoordinatorDashboard({
  userName,
}: {
  userName: string
}) {
  const supabase = createClient()
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics)
  const [attentionRows, setAttentionRows] = useState<AttentionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const now = new Date()
      const year = now.getFullYear()
      const monthIndex = now.getMonth()
      const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`
      const nextMonthStart = new Date(year, monthIndex + 1, 1)
        .toISOString()
        .slice(0, 10)
      const today = localDateString()

      const [
        activePlansResult,
        completedTasksResult,
        pendingReviewsResult,
        submittedReportsResult,
        lgasResult,
        monthlyPlansResult,
        tasksResult,
      ] = await Promise.all([
        supabase
          .from("monthly_plans")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "approved"]),

        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed"),

        supabase
          .from("monthly_plans")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),

        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "approved", "shared"]),

        supabase
          .from("lgas")
          .select("id,name")
          .order("name"),

        supabase
          .from("monthly_plans")
          .select("id,lga_id,plan_month,status,review_note,reviewed_at,reviewed_by")
          .gte("plan_month", monthStart)
          .lt("plan_month", nextMonthStart),

        supabase
          .from("tasks")
          .select("id,lga_id,title,status,deadline,progress_percent"),
      ])

      const results = [
        activePlansResult,
        completedTasksResult,
        pendingReviewsResult,
        submittedReportsResult,
        lgasResult,
        monthlyPlansResult,
        tasksResult,
      ]

      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error

      setMetrics({
        activePlans: activePlansResult.count || 0,
        completedTasks: completedTasksResult.count || 0,
        pendingReviews: pendingReviewsResult.count || 0,
        submittedReports: submittedReportsResult.count || 0,
      })

      const lgas = (lgasResult.data || []) as LGA[]
      const monthlyPlans = (monthlyPlansResult.data || []) as MonthlyPlan[]
      const tasks = (tasksResult.data || []) as Task[]

      const rows: AttentionRow[] = lgas.map((lga) => {
        const plan = monthlyPlans.find((item) => item.lga_id === lga.id)

        const overdueTasks = tasks.filter((task) => {
          return (
            task.lga_id === lga.id &&
            Boolean(task.deadline) &&
            task.deadline! < today &&
            !["completed", "cancelled"].includes(task.status)
          )
        })

        const reasons: string[] = []
        const actions: string[] = []

        if (!plan) {
          reasons.push("No monthly plan recorded")
          actions.push("Follow up on current-month plan submission")
        } else if (plan.status === "submitted") {
          reasons.push("Monthly plan awaiting review")
          actions.push("Review and decide on submitted monthly plan")
        } else if (plan.status === "returned") {
          reasons.push("Monthly plan returned")
          actions.push("Follow up on plan revision and resubmission")
        } else if (plan.status === "draft") {
          reasons.push("Monthly plan still in draft")
          actions.push("Follow up on plan submission")
        }

        if (overdueTasks.length > 0) {
          reasons.push(`${overdueTasks.length} overdue activit${overdueTasks.length === 1 ? "y" : "ies"}`)
          actions.push("Request implementation update and recovery dates")
        }

        return {
          id: lga.id,
          name: lga.name,
          planStatus: planLabel(plan?.status),
          overdueCount: overdueTasks.length,
          reasons: reasons.length ? reasons : ["No flagged issue"],
          actions: actions.length ? actions : ["Continue routine monitoring"],
          hasAttention: reasons.length > 0,
        }
      })

      rows.sort((a, b) => {
        if (a.hasAttention !== b.hasAttention) {
          return a.hasAttention ? -1 : 1
        }
        return b.overdueCount - a.overdueCount
      })

      setAttentionRows(rows)
      setLastUpdated(new Date())
    } catch (err) {
      console.error("Dashboard loading error:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard information."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const currentMonth = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })

  const attentionCount = attentionRows.filter((row) => row.hasAttention).length
  const noPlanCount = attentionRows.filter(
    (row) => row.planStatus === "No monthly plan"
  ).length
  const overdueTotal = attentionRows.reduce(
    (total, row) => total + row.overdueCount,
    0
  )

  return (
    <div className="dashboard-container">
      <section className="welcome-banner">
        <div>
          <h2>Welcome, {userName}</h2>
          <p>Yobe State eHealth Management Overview</p>
          <p>
            Reporting period: <strong>{currentMonth}</strong>
          </p>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <h2>Statewide Overview</h2>
          <p>Live operational indicators from the management system.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadMetrics()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh data"}
        </button>
      </section>

      {error && (
        <div
          role="alert"
          style={{
            padding: "14px",
            marginBottom: "16px",
            border: "1px solid #dc2626",
            borderRadius: "8px",
            color: "#991b1b",
            background: "#fef2f2",
          }}
        >
          Dashboard data could not be loaded: {error}
        </div>
      )}

      <style jsx global>{`
  .stats-grid .stat-card {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    justify-content: center !important;
    gap: 8px !important;
    padding: 20px !important;
    min-height: 125px;
  }
  .stats-grid .stat-card > span {
    display: block;
    order: 0;
    font-size: 14px;
    line-height: 1.4;
  }
  .stats-grid .stat-card > strong {
    display: block;
    order: 1;
    font-size: 30px;
    line-height: 1.15;
    font-weight: 700;
  }
  .stats-grid .stat-card > small {
    display: block;
    order: 2;
    font-size: 12px;
    line-height: 1.4;
  }
`}</style>
<section className="stats-grid">
        <div className="stat-card">
          <span>Active Monthly Plans</span>
          <strong>{loading ? "—" : metrics.activePlans}</strong>
          <small>Submitted or approved plans</small>
        </div>

        <div className="stat-card">
          <span>Completed Tasks</span>
          <strong>{loading ? "—" : metrics.completedTasks}</strong>
          <small>Tasks marked completed</small>
        </div>

        <div className="stat-card">
          <span>Pending Plan Reviews</span>
          <strong>{loading ? "—" : metrics.pendingReviews}</strong>
          <small>Awaiting State Coordinator decision</small>
        </div>

        <div className="stat-card">
          <span>Submitted Reports</span>
          <strong>{loading ? "—" : metrics.submittedReports}</strong>
          <small>Submitted, approved or shared</small>
        </div>
      </section>

      <section className="panel lga-panel" style={{ marginTop: "24px" }}>
        <div
          className="panel-heading"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h2>LGA Attention Register</h2>
            <p>
              Management follow-up based on current monthly plans and recorded
              task deadlines.
            </p>
          </div>
          <span className="live-label">
            {loading ? "Loading..." : `${attentionRows.length} LGAs`}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            margin: "18px 0",
          }}
        >
          <div style={summaryBox}>
            <strong>{loading ? "—" : attentionCount}</strong>
            <span>LGAs requiring attention</span>
          </div>
          <div style={summaryBox}>
            <strong>{loading ? "—" : noPlanCount}</strong>
            <span>Without a current-month plan</span>
          </div>
          <div style={summaryBox}>
            <strong>{loading ? "—" : overdueTotal}</strong>
            <span>Overdue activities</span>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: "20px" }}>Loading LGA management information...</p>
        ) : attentionRows.length === 0 ? (
          <p style={{ padding: "20px" }}>
            No LGA records were returned. Check database access and LGA records.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: "760px",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #d1d5db" }}>
                  {["LGA", "Current Month Plan", "Overdue Tasks", "Management Attention", "Required Action"].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: "12px",
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attentionRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: "1px solid #e5e7eb" }}
                  >
                    <td style={cellStyle}>
                      <strong>{row.name}</strong>
                    </td>
                    <td style={cellStyle}>{row.planStatus}</td>
                    <td style={cellStyle}>
                      <strong>{row.overdueCount}</strong>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {row.reasons.map((reason) => (
                          <span key={reason}>{reason}</span>
                        ))}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {row.actions.map((action) => (
                          <span key={action}>{action}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "16px" }}>
          Important: A missing plan or overdue task is an administrative
          attention flag, not proof of poor performance. This register only
          reflects information currently recorded in the system.
        </p>

        {lastUpdated && (
          <p style={{ fontSize: "12px", color: "#6b7280" }}>
            Last refreshed: {lastUpdated.toLocaleString("en-GB")}
          </p>
        )}
      </section>

      <section className="panel" style={{ marginTop: "20px" }}>
        <div className="panel-heading">
          <h2>Dashboard Data Definitions</h2>
        </div>
        <div className="system-grid">
          <div>
            <strong>Active Monthly Plans</strong>
            <p>Monthly plans with submitted or approved status.</p>
          </div>
          <div>
            <strong>Completed Tasks</strong>
            <p>Tasks whose current status is completed.</p>
          </div>
          <div>
            <strong>Pending Plan Reviews</strong>
            <p>Monthly plans submitted and awaiting a decision.</p>
          </div>
          <div>
            <strong>Submitted Reports</strong>
            <p>Reports marked submitted, approved or shared.</p>
          </div>
          <div>
            <strong>LGA Attention Register</strong>
            <p>
              Compares current-month plan records and overdue task deadlines
              across all LGAs.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

const summaryBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  padding: "12px 16px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  minWidth: "150px",
}

const cellStyle: React.CSSProperties = {
  padding: "13px 12px",
  verticalAlign: "top",
  fontSize: "13px",
}
