"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "lga_coordinator" | "state_coordinator" | "senior_supervisor";

type Props = {
  userId: string;
  role: Role;
  lgaId: string | null;
};

type Issue = {
  id: string;
  lga_id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  assigned_to: string | null;
  assigned_by: string | null;
  deadline: string | null;
  resolution_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Update = {
  id: string;
  issue_id: string;
  update_type: string;
  note: string;
  evidence_reference: string | null;
  created_by: string;
  created_at: string;
};

type Audit = {
  id: string;
  action: string;
  actor_id: string;
  created_at: string;
};

type Lga = {
  id: string;
  name: string;
};

type Coordinator = {
  id: string;
  full_name: string;
  lga_id: string | null;
};

const STATUS: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In progress",
  pending_verification: "Awaiting verification",
  returned: "Returned",
  resolved: "Verified",
  closed: "Closed",
};

const CATEGORIES = [
  "Staffing",
  "Logistics",
  "Data quality",
  "Equipment",
  "Service delivery",
  "Reporting",
  "Other",
];

const SEVERITIES = ["low", "medium", "high", "critical"];

function dateLabel(value: string | null) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function OperationalIssues({
  userId,
  role,
  lgaId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const supervisor =
    role === "state_coordinator" || role === "senior_supervisor";

  const [issues, setIssues] = useState<Issue[]>([]);
  const [lgas, setLgas] = useState<Lga[]>([]);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const [selected, setSelected] = useState<Issue | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [severity, setSeverity] = useState("medium");
  const [createLga, setCreateLga] = useState("");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");

  const [progressNote, setProgressNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError("");

    let query = supabase
      .from("operational_issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (!supervisor) {
      query = query.eq("assigned_to", userId);
    }

    const { data, error: issueError } = await query;

    if (issueError) {
      setError(issueError.message);
      setIssues([]);
      setLoading(false);
      return;
    }

    setIssues((data ?? []) as Issue[]);

    const { data: lgaData, error: lgaError } = await supabase
      .from("lgas")
      .select("id,name")
      .order("name");

    if (!lgaError && lgaData) {
      setLgas(lgaData as Lga[]);
    }

    if (supervisor) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,full_name,lga_id")
        .eq("role", "lga_coordinator")
        .order("full_name");

      if (!profileError && profileData) {
        setCoordinators(profileData as Coordinator[]);

        const profileNames: Record<string, string> = {};
        profileData.forEach((profile) => {
          profileNames[profile.id] = profile.full_name;
        });
        setNames((previous) => ({ ...previous, ...profileNames }));
      } else if (profileError) {
        setError(`Coordinator lookup failed: ${profileError.message}`);
      }
    }

    setLoading(false);
  }, [supabase, supervisor, userId]);

  const loadDetails = useCallback(async (issue: Issue) => {
    setSelected(issue);
    setUpdates([]);
    setAudit([]);
    setError("");

    const { data: updateData, error: updateError } = await supabase
      .from("issue_updates")
      .select("*")
      .eq("issue_id", issue.id)
      .order("created_at", { ascending: false });

    if (updateError) {
      setError(updateError.message);
    } else {
      setUpdates((updateData ?? []) as Update[]);
    }

    if (supervisor) {
      const { data: auditData, error: auditError } = await supabase
        .from("issue_audit_logs")
        .select("id,action,actor_id,created_at")
        .eq("issue_id", issue.id)
        .order("created_at", { ascending: false });

      if (auditError) {
        setError(auditError.message);
      } else {
        setAudit((auditData ?? []) as Audit[]);
      }
    }
  }, [supabase, supervisor]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  async function refreshSelected() {
    const currentId = selected?.id;
    await loadIssues();

    if (!currentId) return;

    const { data, error: refreshError } = await supabase
      .from("operational_issues")
      .select("*")
      .eq("id", currentId)
      .single();

    if (refreshError || !data) {
      setSelected(null);
      return;
    }

    await loadDetails(data as Issue);
  }

  async function createIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const targetLga = createLga;

    if (!targetLga) {
      setError("Select an LGA.");
      setSaving(false);
      return;
    }

    if (assignee) {
      const selectedCoordinator = coordinators.find(
        (person) => person.id === assignee
      );

      if (!selectedCoordinator || selectedCoordinator.lga_id !== targetLga) {
        setError("The selected coordinator does not belong to this LGA.");
        setSaving(false);
        return;
      }
    }

    const { error: insertError } = await supabase
      .from("operational_issues")
      .insert({
        lga_id: targetLga,
        title: title.trim(),
        description: description.trim(),
        category: category.toLowerCase(),
        severity,
        status: assignee ? "assigned" : "open",
        assigned_to: assignee || null,
        created_by: userId,
        deadline: deadline || null,
      });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setTitle("");
    setDescription("");
    setCategory("Other");
    setSeverity("medium");
    setCreateLga("");
    setAssignee("");
    setDeadline("");
    setShowCreate(false);
    setNotice("Operational issue created successfully.");

    setSaving(false);
    await loadIssues();
  }

  async function addProgress() {
    if (!selected || !progressNote.trim()) {
      setError("Enter a progress update.");
      return;
    }

    setSaving(true);
    setError("");

    if (["assigned", "returned"].includes(selected.status)) {
      const { error: statusError } = await supabase
        .from("operational_issues")
        .update({ status: "in_progress" })
        .eq("id", selected.id);

      if (statusError) {
        setError(statusError.message);
        setSaving(false);
        return;
      }
    }

    const { error: insertError } = await supabase
      .from("issue_updates")
      .insert({
        issue_id: selected.id,
        lga_id: selected.lga_id,
        update_type: "progress",
        note: progressNote.trim(),
        created_by: userId,
      });

    if (insertError) {
      setError(
        `Status was updated, but progress history could not be saved: ${insertError.message}`
      );
      setSaving(false);
      await refreshSelected();
      return;
    }

    setProgressNote("");
    setNotice("Progress update saved.");
    setSaving(false);
    await refreshSelected();
  }

  async function submitResolution() {
    if (!selected || !resolutionNote.trim() || !evidenceReference.trim()) {
      setError("Resolution note and evidence reference are required.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: statusError } = await supabase
      .from("operational_issues")
      .update({
        status: "pending_verification",
        resolution_note: resolutionNote.trim(),
      })
      .eq("id", selected.id);

    if (statusError) {
      setError(statusError.message);
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("issue_updates")
      .insert({
        issue_id: selected.id,
        lga_id: selected.lga_id,
        update_type: "resolution",
        note: resolutionNote.trim(),
        evidence_reference: evidenceReference.trim(),
        created_by: userId,
      });

    if (insertError) {
      setError(
        `Status changed, but resolution evidence could not be recorded: ${insertError.message}. Contact a supervisor before proceeding.`
      );
      setSaving(false);
      await refreshSelected();
      return;
    }

    setResolutionNote("");
    setEvidenceReference("");
    setNotice("Resolution submitted for verification.");
    setSaving(false);
    await refreshSelected();
  }

  async function verifyIssue() {
    if (!selected) return;

    setSaving(true);
    setError("");

    const { error: statusError } = await supabase
      .from("operational_issues")
      .update({
        status: "resolved",
        verified_by: userId,
        verified_at: new Date().toISOString(),
      })
      .eq("id", selected.id);

    if (statusError) {
      setError(statusError.message);
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("issue_updates")
      .insert({
        issue_id: selected.id,
        lga_id: selected.lga_id,
        update_type: "verification",
        note: "Resolution independently verified and approved.",
        created_by: userId,
      });

    if (insertError) {
      setError(
        `Issue verified, but verification history could not be saved: ${insertError.message}`
      );
      setSaving(false);
      await refreshSelected();
      return;
    }

    setNotice("Resolution verified successfully.");
    setSaving(false);
    await refreshSelected();
  }

  async function returnIssue() {
    if (!selected || !returnReason.trim()) {
      setError("A return reason is required.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: statusError } = await supabase
      .from("operational_issues")
      .update({
        status: "returned",
        resolution_note: returnReason.trim(),
      })
      .eq("id", selected.id);

    if (statusError) {
      setError(statusError.message);
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("issue_updates")
      .insert({
        issue_id: selected.id,
        lga_id: selected.lga_id,
        update_type: "returned",
        note: returnReason.trim(),
        created_by: userId,
      });

    if (insertError) {
      setError(
        `Issue returned, but the decision history could not be saved: ${insertError.message}`
      );
      setSaving(false);
      await refreshSelected();
      return;
    }

    setReturnReason("");
    setNotice("Issue returned to the coordinator.");
    setSaving(false);
    await refreshSelected();
  }

  async function closeIssue() {
    if (!selected) return;

    setSaving(true);
    setError("");

    const { error: updateError } = await supabase
      .from("operational_issues")
      .update({ status: "closed" })
      .eq("id", selected.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setNotice("Issue closed successfully.");
    }

    setSaving(false);
    await refreshSelected();
  }

  async function reassignIssue(issue: Issue, newAssignee: string) {
    if (!newAssignee) return;

    const person = coordinators.find((item) => item.id === newAssignee);

    if (!person || person.lga_id !== issue.lga_id) {
      setError("Coordinator must belong to the issue's LGA.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: updateError } = await supabase
      .from("operational_issues")
      .update({ assigned_to: newAssignee })
      .eq("id", issue.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setNotice("Issue reassigned.");
      await loadIssues();

      if (selected?.id === issue.id) {
        const { data } = await supabase
          .from("operational_issues")
          .select("*")
          .eq("id", issue.id)
          .single();

        if (data) await loadDetails(data as Issue);
      }
    }

    setSaving(false);
  }

  const visibleIssues = issues.filter((issue) => {
    const matchesStatus = filter === "all" || issue.status === filter;
    const term = search.trim().toLowerCase();

    const matchesSearch =
      !term ||
      issue.title.toLowerCase().includes(term) ||
      issue.description.toLowerCase().includes(term) ||
      (lgas.find((lga) => lga.id === issue.lga_id)?.name ?? "")
        .toLowerCase()
        .includes(term);

    return matchesStatus && matchesSearch;
  });

  const count = (status: string) =>
    issues.filter((issue) => issue.status === status).length;

  const selectedLgaCoordinators = coordinators.filter(
    (person) => person.lga_id === createLga
  );

  return (
    <div className="operational-issues-module">
      <div className="operational-issues-header">
        <div>
          <span className="eyebrow">ACCOUNTABILITY AND FOLLOW-UP</span>
          <h2>{supervisor ? "Operational Issues" : "My Assigned Issues"}</h2>
          <p>
            {supervisor
              ? "Create, assign, monitor and verify operational issues."
              : "Record progress and submit completed resolutions for verification."}
          </p>
        </div>

        {supervisor && (
          <button
            className="primary-button"
            onClick={() => {
              setShowCreate((value) => !value);
              setSelected(null);
              setError("");
            }}
          >
            {showCreate ? "Cancel" : "+ Create issue"}
          </button>
        )}
      </div>

      {error && <div className="oi-message oi-error" role="alert">{error}</div>}
      {notice && <div className="oi-message oi-success" role="status">{notice}</div>}

      {supervisor && (
        <div className="oi-summary">
          <article className="panel"><span>Total issues</span><strong>{issues.length}</strong></article>
          <article className="panel"><span>In progress</span><strong>{count("in_progress")}</strong></article>
          <article className="panel"><span>Awaiting verification</span><strong>{count("pending_verification")}</strong></article>
          <article className="panel"><span>Closed</span><strong>{count("closed")}</strong></article>
        </div>
      )}

      {showCreate && supervisor ? (
        <section className="panel oi-panel">
          <div className="panel-heading">
            <div>
              <h3>Create operational issue</h3>
              <p>Define the issue and assign the responsible LGA.</p>
            </div>
          </div>

          <form className="oi-form" onSubmit={createIssue}>
            <label>
              Issue title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                required
              />
            </label>

            <label>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>

            <div className="oi-form-grid">
              <label>
                LGA
                <select
                  value={createLga}
                  onChange={(event) => {
                    setCreateLga(event.target.value);
                    setAssignee("");
                  }}
                  required
                >
                  <option value="">Select LGA</option>
                  {lgas.map((lga) => (
                    <option key={lga.id} value={lga.id}>{lga.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label>
                Severity
                <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                  {SEVERITIES.map((item) => (
                    <option key={item} value={item}>{item.toUpperCase()}</option>
                  ))}
                </select>
              </label>

              <label>
                Assign LGA Coordinator
                <select
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  disabled={!createLga}
                >
                  <option value="">Leave unassigned</option>
                  {selectedLgaCoordinators.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Deadline
                <input
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </label>
            </div>

            <button className="primary-button" disabled={saving}>
              {saving ? "Creating..." : "Create issue"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="panel oi-panel">
            <div className="panel-heading">
              <div>
                <h3>{supervisor ? "Issue register" : "Your assigned issues"}</h3>
                <p>{visibleIssues.length} matching records</p>
              </div>
              <button className="oi-secondary" onClick={loadIssues}>Refresh</button>
            </div>

            <div className="oi-filters">
              <input
                placeholder="Search issues or LGA..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(STATUS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className="oi-empty">Loading issues...</p>
            ) : visibleIssues.length === 0 ? (
              <p className="oi-empty">No matching operational issues found.</p>
            ) : (
              <div className="oi-list">
                {visibleIssues.map((issue) => (
                  <article className="oi-card" key={issue.id}>
                    <div className="oi-card-top">
                      <div>
                        <span className={`oi-severity ${issue.severity}`}>
                          {issue.severity}
                        </span>
                        <h3>{issue.title}</h3>
                        <p>{lgas.find((lga) => lga.id === issue.lga_id)?.name ?? "LGA"}</p>
                      </div>
                      <span className={`oi-status ${issue.status}`}>
                        {STATUS[issue.status] ?? issue.status}
                      </span>
                    </div>

                    <p className="oi-description">{issue.description}</p>

                    <div className="oi-meta">
                      <span>Deadline: {issue.deadline ?? "Not set"}</span>
                      <span>
                        Assigned: {issue.assigned_to
                          ? names[issue.assigned_to] ?? "Coordinator"
                          : "Unassigned"}
                      </span>
                    </div>

                    {supervisor && ["open", "assigned", "returned"].includes(issue.status) && (
                      <label className="oi-reassign">
                        Reassign coordinator
                        <select
                          value={issue.assigned_to ?? ""}
                          onChange={(event) => reassignIssue(issue, event.target.value)}
                          disabled={saving}
                        >
                          <option value="">Select coordinator</option>
                          {coordinators
                            .filter((person) => person.lga_id === issue.lga_id)
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.full_name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    <button
                      className="oi-view-button"
                      onClick={() => loadDetails(issue)}
                    >
                      View details and history →
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          {selected && (
            <section className="panel oi-panel oi-details">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ISSUE DETAILS</span>
                  <h3>{selected.title}</h3>
                  <p>
                    {lgas.find((lga) => lga.id === selected.lga_id)?.name ?? "LGA"}
                    {" · "}Created {dateLabel(selected.created_at)}
                  </p>
                </div>
                <button className="oi-secondary" onClick={() => setSelected(null)}>
                  Close details
                </button>
              </div>

              <div className="oi-detail-grid">
                <div><span>Status</span><strong>{STATUS[selected.status]}</strong></div>
                <div><span>Severity</span><strong>{selected.severity}</strong></div>
                <div><span>Deadline</span><strong>{selected.deadline ?? "Not set"}</strong></div>
                <div><span>Coordinator</span><strong>{selected.assigned_to ? names[selected.assigned_to] ?? "Assigned" : "Unassigned"}</strong></div>
              </div>

              <p className="oi-description">{selected.description}</p>

              {!supervisor &&
                ["assigned", "in_progress", "returned"].includes(selected.status) && (
                  <div className="oi-action">
                    <h4>Record progress</h4>
                    <textarea
                      placeholder="Describe the action taken and progress made..."
                      value={progressNote}
                      onChange={(event) => setProgressNote(event.target.value)}
                    />
                    <button
                      className="primary-button"
                      onClick={addProgress}
                      disabled={saving || !progressNote.trim()}
                    >
                      Save progress update
                    </button>

                    <hr />

                    <h4>Submit resolution</h4>
                    <p>
                      Provide the resolution and a reference to supporting evidence.
                      This field does not upload a file.
                    </p>
                    <textarea
                      placeholder="Explain how the issue was resolved..."
                      value={resolutionNote}
                      onChange={(event) => setResolutionNote(event.target.value)}
                    />
                    <input
                      placeholder="Evidence reference or document link"
                      value={evidenceReference}
                      onChange={(event) => setEvidenceReference(event.target.value)}
                    />
                    <button
                      className="primary-button"
                      onClick={submitResolution}
                      disabled={saving || !resolutionNote.trim() || !evidenceReference.trim()}
                    >
                      Submit for verification
                    </button>
                  </div>
                )}

              {supervisor && selected.status === "pending_verification" && (
                <div className="oi-action">
                  <h4>Verification decision</h4>
                  <p>Review the resolution history and evidence reference before deciding.</p>
                  <textarea
                    placeholder="Reason for returning the issue (leave blank to verify)"
                    value={returnReason}
                    onChange={(event) => setReturnReason(event.target.value)}
                  />
                  <div className="oi-actions">
                    <button
                      className="primary-button"
                      onClick={verifyIssue}
                      disabled={saving}
                    >
                      Verify resolution
                    </button>
                    <button
                      className="oi-danger"
                      onClick={returnIssue}
                      disabled={saving || !returnReason.trim()}
                    >
                      Return to coordinator
                    </button>
                  </div>
                </div>
              )}

              {supervisor && selected.status === "resolved" && (
                <div className="oi-action">
                  <h4>Close verified issue</h4>
                  <p>Closure is final. Closed issues cannot be modified.</p>
                  <button className="primary-button" onClick={closeIssue} disabled={saving}>
                    Close issue
                  </button>
                </div>
              )}

              <div className="oi-history">
                <h4>Progress and resolution history</h4>
                {updates.length === 0 ? (
                  <p className="oi-empty">No updates recorded.</p>
                ) : updates.map((item) => (
                  <article className="oi-history-item" key={item.id}>
                    <div>
                      <strong>{item.update_type.replaceAll("_", " ")}</strong>
                      <span>{dateLabel(item.created_at)}</span>
                    </div>
                    <p>{item.note}</p>
                    {item.evidence_reference && (
                      <p className="oi-evidence">
                        Evidence reference: {item.evidence_reference}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              {supervisor && (
                <div className="oi-history">
                  <h4>Audit history</h4>
                  {audit.length === 0 ? (
                    <p className="oi-empty">No audit records available.</p>
                  ) : audit.map((item) => (
                    <article className="oi-history-item" key={item.id}>
                      <div>
                        <strong>{item.action}</strong>
                        <span>{dateLabel(item.created_at)}</span>
                      </div>
                      <p>Actor ID: {item.actor_id}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
