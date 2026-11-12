"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MyPlans from "./my-plans";
import MyTasks from "./my-tasks";
import WorkingDays from "./working-days";
import CampaignCheckin from "./campaign-checkin";
import CampaignReadiness from "./campaign-readiness";
import DeviceProgress from "./device-progress";
import SupportiveSupervision from "./supportive-supervision";
import MovementRequests from "./movement-requests";
import MyReports from "./my-reports";
import LGAPerformance from "./lga-performance";
import PlansTasksManagement from "./plans-tasks-management";
import FeedbackInbox from "./feedback-inbox";
import WorkingDaysApprovals from "./working-days-approvals";
import CampaignMonitoring from "./campaign-monitoring";
import StateReportConsolidation from "./state-report-consolidation";
import ReportSharing from "./report-sharing";
import ManagementMovementApprovals from "./management-movement-approvals";
import BossDashboard from "./boss-dashboard";
import StateCoordinatorDashboard from "./state-coordinator-dashboard";
import OperationalIssues from "./operational-issues";
import DashboardOverview from "./dashboard-overview";

type Role =
  | "lga_coordinator"
  | "state_coordinator"
  | "senior_supervisor"
  | "management_approver"
  | "boss";

type User = {
  id: string;
  lgaId: string | null;
  name: string;
  role: Role;
  lga?: string;
  initials: string;
};

const roleLabels: Record<Role, string> = {
  lga_coordinator: "LGA Coordinator",
  state_coordinator: "State Coordinator",
  senior_supervisor: "Senior Supervisor",
  management_approver: "Management Approver",
  boss: "Management Viewer",
};

const navigation: Record<Role, { label: string; icon: string }[]> = {
  lga_coordinator: [
    { label: "Dashboard", icon: ">" },
    { label: "My Plans", icon: ">" },
    { label: "My Tasks", icon: ">" },
    { label: "Working Days", icon: ">" },
    { label: "Campaign Check-in", icon: ">" },
    { label: "Campaign Readiness", icon: ">" },
    { label: "Device Progress", icon: ">" },
    { label: "Supportive Supervision", icon: ">" },
    { label: "My Operational Issues", icon: ">" },
    { label: "Movement Requests", icon: ">" },
    { label: "My Reports", icon: ">" },
  ],
  state_coordinator: [
    { label: "Dashboard", icon: ">" },
    { label: "LGA Performance", icon: ">" },
    { label: "Plans & Tasks", icon: ">" },
    { label: "Working Days", icon: ">" },
    { label: "Campaign Monitoring", icon: ">" },
    { label: "Movement Requests", icon: ">" },
    { label: "Reports", icon: ">" },
  ],
  senior_supervisor: [
    { label: "Dashboard", icon: ">" },
    { label: "State Overview", icon: ">" },
    { label: "LGA Performance", icon: ">" },
    { label: "Plans & Tasks", icon: ">" },
    { label: "Working Days", icon: ">" },
    { label: "Campaign Monitoring", icon: ">" },
    { label: "Report Consolidation", icon: ">" },
    { label: "Management Sharing", icon: ">" },
  ],
  management_approver: [
    { label: "Dashboard", icon: ">" },
    { label: "Pending Movement Requests", icon: ">" },
    { label: "Decision History", icon: ">" },
  ],
  boss: [
    { label: "Executive Dashboard", icon: ">" },
    { label: "Monthly Reports", icon: ">" },
    { label: "LGA Comparisons", icon: ">" },
    { label: "Report Archive", icon: ">" },
  ],
};

function Login() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.reload();
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-lockup">
          <div className="brand-logo"><img src="/images/ehealth-africa-logo.png" alt="eHealth Africa" /></div>
          <div>
            <strong>eHealth LC Manager</strong>
            <span>Yobe State - Health Operations</span>
          </div>
        </div>

        <div className="login-message">
          <span className="eyebrow">HEALTH OPERATIONS PLATFORM</span>
          <h1>Better coordination.<br />Stronger accountability.</h1>
          <p>
            A centralized platform for planning, monitoring and reporting
            local government health operations across Yobe State.
          </p>
          <div className="login-trust">
            <span>16 LGAs</span>
            <span> - </span>
            <span>Centralized reporting</span>
            <span> - </span>
            <span>Field operations</span>
          </div>
        </div>

        <div className="login-footer">
          Yobe State Health Operations - Internal Management Platform
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <div className="brand-logo"><img src="/images/ehealth-africa-logo.png" alt="eHealth Africa" /></div>
            <strong>eHealth LC Manager</strong>
          </div>

          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Enter your authorized account credentials.</p>

          <form onSubmit={handleLogin}>
            <label className="field-label" htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              className="field"
              type="email"
              autoComplete="username"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label className="field-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="field"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {error && (
              <div className="demo-notice" role="alert">
                <strong>Sign-in failed</strong>
                <span>{error}</span>
              </div>
            )}

            <button
              className="primary-button full-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="login-disclaimer">
            Access is restricted to authorized Yobe State health operations
            personnel. Contact your system administrator if you need an account.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function AppShell() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [active, setActive] = useState("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { data: { user: authUser }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authUser) {
        if (mounted) {
          setUser(null);
          setAuthLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role, lga_id")
        .eq("id", authUser.id)
        .single();

      if (profileError || !profile) {
        if (mounted) {
          setAuthError(`Profile lookup failed [${profileError?.code ?? "NO_DATA"}]: ${profileError?.message ?? "Profile not found"}. Auth ID: ${authUser.id}`);
          setAuthLoading(false);
        }
        return;
      }

      const allowedRoles: Role[] = [
        "lga_coordinator",
        "state_coordinator",
        "senior_supervisor",
        "management_approver",
        "boss",
      ];

      if (!allowedRoles.includes(profile.role as Role)) {
        if (mounted) {
          setAuthError("Your account has an unrecognized role. Contact the system administrator.");
          setAuthLoading(false);
        }
        return;
      }

      let lgaName: string | undefined;

      if (profile.lga_id) {
        const { data: lga } = await supabase
          .from("lgas")
          .select("name")
          .eq("id", profile.lga_id)
          .single();

        lgaName = lga?.name;
      }

      if (mounted) {
        setUser({
          id: authUser.id,
          lgaId: profile.lga_id,
          name: profile.full_name,
          role: profile.role as Role,
          lga: lgaName,
          initials: profile.full_name
            .split(" ")
            .filter(Boolean)
            .map((part: string) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
        });
        setAuthLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (authLoading) {
    return <main className="login-page"><div className="login-card">Loading your secure workspace...</div></main>;
  }

  if (authError) {
    return (
      <main className="login-page">
        <div className="login-card">
          <h2>Account access issue</h2>
          <p role="alert">{authError}</p>
          <button className="primary-button full-button" onClick={handleLogout}>Sign out</button>
        </div>
      </main>
    );
  }

  if (!user) return <Login />;

  const items = navigation[user.role];
  const isBoss = user.role === "boss";

  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-logo"><img src="/images/ehealth-africa-logo.png" alt="eHealth Africa" /></div>
          <div>
            <strong>eHealth LC</strong>
            <span>MANAGEMENT SYSTEM</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}>Ã—</button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <div className="workspace-icon">Y</div>
          <div>
            <strong>Yobe State</strong>
            <span>Health Operations</span>
          </div>
          <span className="workspace-arrow"> - </span>
        </div>

        <div className="nav-heading">MAIN MENU</div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${active === item.label ? "nav-active" : ""}`}
              onClick={() => {
                setActive(item.label);
                setMobileOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.label === "Pending Movement Requests" && (
                <span className="nav-count">4</span>
              )}
            </button>
          ))}
        </nav>

        {!isBoss && (
          <>
            <div className="nav-heading secondary-heading">ACCOUNT</div>
            <button className="nav-item" onClick={() => setActive("Notifications")}>
              <span className="nav-icon"> - </span>
              Notifications
              <span className="notification-dot" />
            </button>
            <button className="nav-item" onClick={() => setActive("My Profile")}>
              <span className="nav-icon"> - </span>
              My Profile
            </button>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-indicator" />
            <div>
              <strong>Authenticated session</strong>
              <span>Supabase authentication active</span>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <span> - </span> Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMobileOpen(true)}>â˜°</button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{active}</strong>
          </div>

          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setActive("Notifications")}
            >
              <svg className="notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
  <path d="M10 21h4" />
</svg>
            </button>
            <div className="profile-divider" />
            <div className="profile-summary">
              <div className="avatar">{user.initials}</div>
              <div className="profile-text">
                <strong>{user.name}</strong>
                <span>{roleLabels[user.role]}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOBE STATE  -  HEALTH OPERATIONS</div>
              <h1>
                {active === "Dashboard"
                  ? `Good day, ${user.name.split(" ")[0]}`
                  : active}
              </h1>
              <p>
                {user.lga ? `${user.lga} Local Government Area  -  ` : ""}
                Here is your operational overview.
              </p>
            </div>
            <div className="date-label">{new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
          </div>

          {active === "Notifications" && ["lga_coordinator", "state_coordinator", "senior_supervisor"].includes(user.role) ? (
            <FeedbackInbox userId={user.id} role={user.role as "lga_coordinator" | "state_coordinator" | "senior_supervisor"} />
          ) : active === "My Plans" ? (
            <MyPlans
  userId={user.id}
  lgaId={user.lgaId}
/>
          ) : active === "My Tasks" ? (
            <MyTasks />
          ) : active === "Working Days" && user.role === "lga_coordinator" ? (
            <WorkingDays userId={user.id} lgaId={user.lgaId} />
          ) : active === "Campaign Check-in" && user.role === "lga_coordinator" ? (
            <CampaignCheckin />
          ) : active === "Campaign Readiness" && user.role === "lga_coordinator" ? (
            <CampaignReadiness />
          ) : active === "Device Progress" && user.role === "lga_coordinator" ? (
            <DeviceProgress />
          ) : active === "Supportive Supervision" && user.role === "lga_coordinator" ? (
            <SupportiveSupervision />
          ) : active === "Movement Requests" && user.role === "lga_coordinator" ? (
            <MovementRequests />
          ) : active === "My Reports" && user.role === "lga_coordinator" ? (
            <MyReports />
          ) : active === "LGA Performance" && (user.role === "state_coordinator" || user.role === "senior_supervisor") ? (
            <LGAPerformance />
          ) : active === "Plans & Tasks" && (user.role === "state_coordinator" || user.role === "senior_supervisor") ? (
            <PlansTasksManagement userId={user.id} role={user.role} />
          ) : active === "Working Days" && (user.role === "state_coordinator" || user.role === "senior_supervisor") ? (
            <WorkingDaysApprovals userId={user.id} />
          ) : active === "Campaign Monitoring" && (user.role === "state_coordinator" || user.role === "senior_supervisor") ? (
            <CampaignMonitoring />
          ) : active === "Reports" && (user.role === "state_coordinator" || user.role === "senior_supervisor") ? (
            <StateReportConsolidation />
          ) : active === "Report Sharing" && (user.role === "senior_supervisor" || user.role === "boss") ? (
            <ReportSharing />
          ) : active === "Movement Requests" && user.role === "management_approver" ? (
            <ManagementMovementApprovals />
          ) : (active === "State Overview" && user.role === "senior_supervisor") || ((active === "State Overview" || active === "Reports") && user.role === "boss") ? (
            <BossDashboard />
          ) : (active === "Operational Issues" && (user.role === "state_coordinator" || user.role === "senior_supervisor")) ||
            (active === "My Operational Issues" && user.role === "lga_coordinator") ? (
            <OperationalIssues
              userId={user.id}
              role={user.role as "lga_coordinator" | "state_coordinator" | "senior_supervisor"}
              lgaId={user.lgaId}
            />          ) : ((active === "Dashboard" || active === "State Overview") && (user.role === "state_coordinator" || user.role === "senior_supervisor")) ? (
            <StateCoordinatorDashboard userName={user.name} />
          ) : active === "Dashboard" || active === "Executive Dashboard" ? (
            <>
              <section className="welcome-banner">
                <div>
                  <span className="banner-label">YOBE STATE HEALTH OPERATIONS</span>
                  <h2>Welcome, {user.name}</h2>
                  <p>
                    {roleLabels[user.role]} workspace. Access your operational
                    responsibilities, reports and programme activities.
                  </p>
                </div>
                <div className="banner-mark">
                  <img src="/images/ehealth-africa-logo.png" alt="eHealth Africa" />
                </div>
              </section>

              <DashboardOverview lgaId={user.lgaId} />
              <section className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Workspace shortcuts</h3>
                    <p>Open your frequently used operational modules</p>
                  </div>
                </div>
                <div className="quick-links">
                  {items
                    .filter((item) => item.label !== "Dashboard" && item.label !== "Executive Dashboard")
                    .slice(0, 6)
                    .map((item) => (
                      <button key={item.label} onClick={() => setActive(item.label)}>
                        <span className="quick-icon">{item.icon}</span>
                        <strong>{item.label}</strong>
                        <span className="quick-arrow">â†’</span>
                      </button>
                    ))}
                </div>
              </section>

              <section className="panel lga-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Platform information</h3>
                    <p>Yobe State eHealth LC Manager</p>
                  </div>
                  <span className="live-label">AUTHENTICATED</span>
                </div>
                <div className="system-grid">
                  <div><span>Signed-in user</span><strong>{user.name}</strong></div>
                  <div><span>Assigned role</span><strong>{roleLabels[user.role]}</strong></div>
                  <div><span>Assigned LGA</span><strong>{user.lga || "State level"}</strong></div>
                  <div><span>Authentication</span><strong>Supabase</strong></div>
                </div>
              </section>
            </>
          ) : (
            <section className="panel placeholder-panel">
              <div className="placeholder-icon"> - </div>
              <h2>{active}</h2>
              <p>
                This module is included in the application navigation.
                Its full workflow and data interface will be implemented in
                the next build stages.
              </p>
              <span className="live-label">INTERFACE MODULE  -  IN DEVELOPMENT</span>
            </section>
          )}

          <footer className="app-footer">
            <span>eHealth LC Manager  -  Yobe State</span>
            <span>Yobe State Health Operations</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
