"use client";

import { useState } from "react";

type Task = {
  id: number;
  title: string;
  description: string;
  deliverable: string;
  assignedBy: string;
  deadline: string;
  priority: string;
  progress: number;
  status: string;
  comment: string;
};

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Conduct supportive supervision",
    description: "Visit selected health facilities and assess service delivery.",
    deliverable: "Supervision report with field evidence",
    assignedBy: "State Coordinator",
    deadline: "2026-11-12",
    priority: "High",
    progress: 50,
    status: "Ongoing",
    comment: "Ensure all required evidence is attached.",
  },
  {
    id: 2,
    title: "Submit monthly campaign report",
    description: "Compile and submit the November campaign monitoring report.",
    deliverable: "Approved monthly campaign report",
    assignedBy: "Senior Supervisor",
    deadline: "2026-11-20",
    priority: "Urgent",
    progress: 0,
    status: "Assigned",
    comment: "",
  },
  {
    id: 3,
    title: "Update operational records",
    description: "Review and update the LGA operational activity records.",
    deliverable: "Updated records",
    assignedBy: "State Coordinator",
    deadline: "2026-11-25",
    priority: "Medium",
    progress: 100,
    status: "Awaiting verification",
    comment: "Please verify completion.",
  },
];

export default function MyTasks() {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("All");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [evidence, setEvidence] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [notice, setNotice] = useState("");

  const filtered = filter === "All"
    ? tasks
    : tasks.filter((task) => task.status === filter);

  function updateProgress(id: number, progress: number) {
    setTasks((previous) => previous.map((task) =>
      task.id === id
        ? {
            ...task,
            progress,
            status: progress === 100
              ? "Awaiting verification"
              : progress > 0
                ? "Ongoing"
                : "Assigned",
          }
        : task
    ));
    setNotice("Progress updated. Completion remains subject to supervisor verification.");
  }

  function submitEvidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask) return;

    setTasks((previous) => previous.map((task) =>
      task.id === selectedTask.id
        ? { ...task, status: "Awaiting verification" }
        : task
    ));

    setNotice("Evidence submission recorded in demo mode. Actual file upload will be connected later.");
    setSelectedTask(null);
    setEvidence("");
    setEvidenceDescription("");
  }

  const count = (status: string) =>
    tasks.filter((task) => task.status === status).length;

  return (
    <div className="tasks-module">
      {notice && (
        <div className="plans-notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="tasks-intro">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Assigned Tasks</h2>
          <p>Review assignments, update progress and submit evidence for verification.</p>
        </div>
        <span className="plan-draft-badge">DEMO DATA</span>
      </div>

      <div className="task-summary-grid">
        <div className="plan-summary-card">
          <span>Total assigned</span>
          <strong>{tasks.length}</strong>
          <small>All assigned tasks</small>
        </div>
        <div className="plan-summary-card">
          <span>Ongoing</span>
          <strong>{count("Ongoing")}</strong>
          <small>Currently in progress</small>
        </div>
        <div className="plan-summary-card">
          <span>Awaiting verification</span>
          <strong>{count("Awaiting verification")}</strong>
          <small>Submitted for review</small>
        </div>
        <div className="plan-summary-card">
          <span>Assigned</span>
          <strong>{count("Assigned")}</strong>
          <small>Not yet started</small>
        </div>
      </div>

      <section className="panel tasks-list-panel">
        <div className="panel-heading">
          <div>
            <h3>My assigned tasks</h3>
            <p>Tasks assigned by your supervisors</p>
          </div>
          <select
            className="plan-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {["All", "Assigned", "Ongoing", "Awaiting verification", "Returned for revision", "Completed"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>

        <div className="task-list">
          {filtered.map((task) => (
            <article className="task-card" key={task.id}>
              <div className="task-card-header">
                <div>
                  <span className={`plan-status ${
                    task.status === "Completed" ? "plan-status-completed" :
                    task.status === "Ongoing" ? "plan-status-ongoing" :
                    task.status === "Awaiting verification" ? "plan-status-returned" :
                    "plan-status-planned"
                  }`}>{task.status}</span>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                </div>
                <span className={`priority priority-${task.priority.toLowerCase()}`}>
                  {task.priority} priority
                </span>
              </div>

              <div className="task-deliverable">
                <span>EXPECTED DELIVERABLE</span>
                <strong>{task.deliverable}</strong>
              </div>

              <div className="task-meta">
                <span>Assigned by: <strong>{task.assignedBy}</strong></span>
                <span>Deadline: <strong>{task.deadline}</strong></span>
              </div>

              {task.comment && (
                <div className="task-supervisor-comment">
                  <strong>Supervisor comment</strong>
                  <p>{task.comment}</p>
                </div>
              )}

              <div className="plan-progress-heading">
                <span>Reported progress</span>
                <strong>{task.progress}%</strong>
              </div>
              <div className="plan-progress-track">
                <div
                  className="plan-progress-fill"
                  style={{ width: `${task.progress}%` }}
                />
              </div>

              <div className="task-actions">
                <label>
                  Update progress
                  <select
                    value={task.progress}
                    onChange={(event) => updateProgress(task.id, Number(event.target.value))}
                  >
                    {[...new Set([0, 25, 50, 75, 100, task.progress])].sort((a, b) => a - b).map((value) => (
                      <option key={value} value={value}>{value}%</option>
                    ))}
                  </select>
                </label>

                <button
                  className="primary-button task-evidence-button"
                  onClick={() => setSelectedTask(task)}
                >
                  Submit evidence →
                </button>
              </div>

              {task.progress === 100 && task.status !== "Completed" && (
                <div className="verification-note">
                  Progress reported as 100%. This task is not complete until a supervisor verifies it.
                </div>
              )}
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="plan-empty">
              <strong>No tasks found</strong>
              <p>There are no tasks matching this filter.</p>
            </div>
          )}
        </div>
      </section>

      {selectedTask && (
        <div className="plan-modal-backdrop">
          <section className="plan-modal">
            <div className="plan-modal-heading">
              <div>
                <span className="eyebrow">TASK EVIDENCE</span>
                <h2>Submit task evidence</h2>
              </div>
              <button className="plan-modal-close" onClick={() => setSelectedTask(null)}>×</button>
            </div>

            <p className="task-modal-description">{selectedTask.title}</p>

            <form onSubmit={submitEvidence}>
              <label className="plan-form-field">
                Evidence description *
                <textarea
                  rows={4}
                  required
                  value={evidenceDescription}
                  onChange={(event) => setEvidenceDescription(event.target.value)}
                  placeholder="Describe the work completed and evidence provided."
                />
              </label>

              <label className="plan-form-field">
                Evidence reference
                <input
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="Enter a reference or filename for this demo"
                />
              </label>

              <div className="plan-form-note">
                File uploads, photographs, timestamps and GPS metadata will be implemented with secure storage integration. This demo does not upload actual files.
              </div>

              <div className="plan-form-actions">
                <button type="button" className="plan-cancel-button" onClick={() => setSelectedTask(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Submit evidence
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
