"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Task = {
  id: string;
  lga_id: string;
  title: string;
  activity_description: string | null;
  expected_deliverable: string;
  deadline: string | null;
  priority: number;
  progress_percent: number;
  status: "planned" | "ongoing" | "completed" | "returned_for_revision" | "cancelled";
};
type Assignment = { task_id: string; assigned_at: string };
type Evidence = { id: string; task_id: string; storage_path: string; file_name: string; mime_type: string | null; uploaded_at: string; reviewed_at: string | null; review_note: string | null };
type Feedback = { id: string; task_id: string; author_role: string; body: string; created_at: string };

const statusLabels: Record<Task["status"], string> = {
  planned: "Planned",
  ongoing: "Ongoing",
  completed: "Completed",
  returned_for_revision: "Returned for revision",
  cancelled: "Cancelled",
};

export default function MyTasks({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignedAt, setAssignedAt] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadingTask, setUploadingTask] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (!lgaId) { setTasks([]); setLoading(false); return; }
    const db = createClient();
    const assignmentResult = await db.from("task_assignments").select("task_id,assigned_at").eq("assignee_id", userId).eq("lga_id", lgaId).is("unassigned_at", null).order("assigned_at", { ascending: false });
    if (assignmentResult.error) { setError(assignmentResult.error.message); setLoading(false); return; }
    const assignments = (assignmentResult.data ?? []) as Assignment[];
    const taskIds = [...new Set(assignments.map((row) => row.task_id))];
    setAssignedAt(Object.fromEntries(assignments.map((row) => [row.task_id, row.assigned_at])));
    if (taskIds.length === 0) { setTasks([]); setEvidence([]); setFeedback([]); setLoading(false); return; }
    const [taskResult, evidenceResult, feedbackResult] = await Promise.all([
      db.from("tasks").select("id,lga_id,title,activity_description,expected_deliverable,deadline,priority,progress_percent,status").in("id", taskIds).eq("lga_id", lgaId).order("deadline", { ascending: true, nullsFirst: false }),
      db.from("task_evidence").select("id,task_id,storage_path,file_name,mime_type,uploaded_at,reviewed_at,review_note").in("task_id", taskIds).order("uploaded_at", { ascending: false }),
      db.from("task_comments").select("id,task_id,author_role,body,created_at").in("task_id", taskIds).eq("addressed_to_role", "lga_coordinator").order("created_at", { ascending: false }),
    ]);
    const failure = taskResult.error ?? evidenceResult.error ?? feedbackResult.error;
    if (failure) setError(failure.message);
    else {
      setTasks((taskResult.data ?? []) as Task[]);
      setEvidence((evidenceResult.data ?? []) as Evidence[]);
      setFeedback((feedbackResult.data ?? []) as Feedback[]);
    }
    setLoading(false);
  }, [userId, lgaId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const filtered = useMemo(() => filter === "all" ? tasks : tasks.filter((task) => task.status === filter), [tasks, filter]);
  const progressEligible = (task: Task) => !["completed", "cancelled"].includes(task.status);

  async function updateProgress(task: Task, value: number) {
    if (!progressEligible(task)) return;
    setSaving(task.id); setError(""); setNotice("");
    const db = createClient();
    const { data: assignment, error: assignmentError } = await db.from("task_assignments").select("id").eq("task_id", task.id).eq("assignee_id", userId).eq("lga_id", lgaId).is("unassigned_at", null).maybeSingle();
    if (assignmentError || !assignment) {
      setError(assignmentError?.message || "This task is no longer assigned to you. Refresh the list.");
      setSaving(null);
      return;
    }
    const { data, error: updateError } = await db.from("tasks").update({ progress_percent: value, updated_by: userId }).eq("id", task.id).eq("lga_id", lgaId).in("status", ["planned", "ongoing", "returned_for_revision"]).select("id").maybeSingle();
    if (updateError) setError(updateError.message);
    else if (!data) setError("This task is no longer available for progress updates. Refresh the list.");
    else { setNotice("Progress saved. A 100% report remains subject to supervisor verification."); await load(); }
    setSaving(null);
  }

  async function uploadEvidence(task: Task, file: File) {
    if (!lgaId || uploadingTask) return;
    if (!new Set(["image/jpeg", "image/png", "application/pdf"]).has(file.type)) { setError("Evidence must be a JPEG, PNG, or PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Evidence files must be 10 MB or smaller."); return; }
    setUploadingTask(task.id); setError(""); setNotice("");
    const db = createClient();
    const { data: activeAssignment, error: assignmentError } = await db.from("task_assignments").select("id").eq("task_id", task.id).eq("assignee_id", userId).eq("lga_id", lgaId).is("unassigned_at", null).maybeSingle();
    if (assignmentError || !activeAssignment) { setError(assignmentError?.message ?? "This task is no longer actively assigned to you."); setUploadingTask(null); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${lgaId}/${userId}/tasks/${task.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await db.storage.from("campaign-evidence").upload(path, file, { contentType: file.type, upsert: false });
    if (storageError) { setError(storageError.message); setUploadingTask(null); return; }
    const { error: metadataError } = await db.from("task_evidence").insert({ task_id: task.id, storage_path: path, file_name: file.name, mime_type: file.type, uploaded_by: userId });
    if (metadataError) {
      await db.storage.from("campaign-evidence").remove([path]);
      setError(metadataError.message);
    } else { setNotice("Evidence uploaded to private storage and attached to the task."); await load(); }
    setUploadingTask(null);
  }

  async function openEvidence(item: Evidence) {
    const { data, error: signedUrlError } = await createClient().storage.from("campaign-evidence").createSignedUrl(item.storage_path, 60);
    if (signedUrlError || !data?.signedUrl) { setError(signedUrlError?.message ?? "Could not create a secure evidence link."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const count = (status: Task["status"]) => tasks.filter((task) => task.status === status).length;

  return <div className="tasks-module">
    {(error || notice) && <div className="plans-notice" role={error ? "alert" : "status"}><span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
    <div className="tasks-intro"><div><span className="eyebrow">LGA TASK WORKSPACE</span><h2>Assigned Tasks</h2><p>View active assignments, update reported progress and review supervisor feedback.</p></div><span className="live-label">LIVE RECORDS</span></div>
    <div className="task-summary-grid"><div className="plan-summary-card"><span>Assigned tasks</span><strong>{tasks.length}</strong><small>Active assignments</small></div><div className="plan-summary-card"><span>Ongoing</span><strong>{count("ongoing")}</strong><small>Currently in progress</small></div><div className="plan-summary-card"><span>Returned</span><strong>{count("returned_for_revision")}</strong><small>Requires further work</small></div><div className="plan-summary-card"><span>Completed</span><strong>{count("completed")}</strong><small>Recorded completed status</small></div></div>
    <section className="panel tasks-list-panel"><div className="panel-heading"><div><h3>My assigned tasks</h3><p>Only assignments currently assigned to your account in this LGA are listed.</p></div><div><select className="plan-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div></div>
      {loading ? <div className="plan-empty">Loading assigned tasks…</div> : error ? null : filtered.length === 0 ? <div className="plan-empty"><strong>No assigned tasks found</strong><p>Tasks assigned to your account will appear here.</p></div> : <div className="task-list">{filtered.map((task) => {
        const taskEvidence = evidence.filter((item) => item.task_id === task.id);
        const taskFeedback = feedback.filter((item) => item.task_id === task.id);
        const locked = !progressEligible(task);
        return <article className="task-card" key={task.id}>
          <div className="task-card-header"><div><span className={`plan-status ${task.status === "completed" ? "plan-status-completed" : task.status === "ongoing" ? "plan-status-ongoing" : task.status === "returned_for_revision" ? "plan-status-returned" : "plan-status-planned"}`}>{statusLabels[task.status]}</span><h3>{task.title}</h3><p>{task.activity_description || "No task description provided."}</p></div><span className="priority">Priority {task.priority}</span></div>
          <div className="task-deliverable"><span>EXPECTED DELIVERABLE</span><strong>{task.expected_deliverable}</strong></div>
          <div className="task-meta"><span>Assignment date: <strong>{assignedAt[task.id] ? new Date(assignedAt[task.id]).toLocaleDateString("en-GB") : "—"}</strong></span><span>Deadline: <strong>{task.deadline ? new Date(`${task.deadline}T00:00:00`).toLocaleDateString("en-GB") : "Not set"}</strong></span></div>
          <div className="plan-progress-heading"><span>Reported progress</span><strong>{task.progress_percent}%</strong></div><div className="plan-progress-track"><div className="plan-progress-fill" style={{ width: `${task.progress_percent}%` }} /></div>
          <div className="task-actions"><label>Update reported progress<select disabled={locked || saving === task.id} value={task.progress_percent} onChange={(event) => void updateProgress(task, Number(event.target.value))}>{[...new Set([0, 25, 50, 75, 100, task.progress_percent])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>{saving === task.id && <span role="status">Saving…</span>}</div>
          <p className="campaign-monitoring-note">Reported progress does not change the task status; only an authorized supervisor can review status and completion.</p>
          {task.progress_percent === 100 && task.status !== "completed" && <div className="verification-note">Progress reported as 100%. The database has no separate progress-submission history; completion must be verified by a supervisor.</div>}
          <section className="task-supervisor-comment"><strong>Reviewer feedback</strong>{taskFeedback.length ? taskFeedback.map((item) => <p key={item.id}>{item.body}<small> — {item.author_role.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleString("en-GB")}</small></p>) : <p>No feedback addressed to your role is available.</p>}</section>
          <section className="task-supervisor-comment"><strong>Evidence and review history</strong>{taskEvidence.length ? taskEvidence.map((item) => <p key={item.id}><button type="button" className="secondary-button" onClick={() => void openEvidence(item)}>{item.file_name}</button> · submitted {new Date(item.uploaded_at).toLocaleString("en-GB")}{item.reviewed_at ? <><br />Reviewed {new Date(item.reviewed_at).toLocaleString("en-GB")}: {item.review_note || "No review note recorded."}</> : <><br />Awaiting review</>}</p>) : <p>No evidence records are available.</p>}<label>Upload evidence (JPEG, PNG, or PDF; max 10 MB)<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={uploadingTask === task.id || locked} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(task, file); event.currentTarget.value = ""; }} /></label>{uploadingTask === task.id && <span role="status">Uploading evidence…</span>}<small>Files are stored privately and linked to this task. Access depends on the approved storage policies.</small></section>
        </article>;
      })}</div>}
    </section>
  </div>;
}
