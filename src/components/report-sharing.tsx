"use client";

import { useMemo, useState } from "react";

type SharedReport = {
  id: number;
  title: string;
  period: string;
  status: "Approved" | "Draft" | "Returned";
  approvedBy: string;
  approvedAt: string;
};

type ShareRecord = {
  id: number;
  reportTitle: string;
  recipient: string;
  sharedBy: string;
  sharedAt: string;
  access: "Active" | "Revoked";
  reference: string;
};

const approvedReports: SharedReport[] = [
  { id: 1, title: "Yobe State Monthly Operational Report", period: "October 2026", status: "Approved", approvedBy: "Senior Supervisor", approvedAt: "2026-11-02 16:30" },
  { id: 2, title: "Campaign Implementation Report", period: "October 2026", status: "Approved", approvedBy: "Senior Supervisor", approvedAt: "2026-11-02 17:00" },
  { id: 3, title: "Yobe State Monthly Operational Report", period: "November 2026", status: "Draft", approvedBy: "—", approvedAt: "—" },
  { id: 4, title: "LGA Performance Summary", period: "September 2026", status: "Returned", approvedBy: "—", approvedAt: "—" },
];

export default function ReportSharing() {
  const [reports] = useState<SharedReport[]>(approvedReports);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [selectedReport, setSelectedReport] = useState("");
  const [recipient, setRecipient] = useState("Office of the Boss");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [role, setRole] = useState<"senior_supervisor" | "boss">("senior_supervisor");
  const [selectedShare, setSelectedShare] = useState<number | null>(null);

  const availableReports = useMemo(
    () => reports.filter((report) => report.status === "Approved"),
    [reports]
  );

  const activeShares = shares.filter((share) => share.access === "Active").length;

  function createShare() {
    const report = availableReports.find((item) => item.id === Number(selectedReport));

    if (!report) {
      alert("Select an approved report first.");
      return;
    }

    if (!recipient.trim() || !recipientEmail.trim() || !recipientEmail.includes("@")) {
      alert("Enter the intended recipient and a valid email address.");
      return;
    }

    const share: ShareRecord = {
      id: Date.now(),
      reportTitle: `${report.title} — ${report.period}`,
      recipient: `${recipient.trim()} (${recipientEmail.trim()})`,
      sharedBy: "Senior Supervisor (demo)",
      sharedAt: new Date().toLocaleString(),
      access: "Active",
      reference: `DEMO-SHARE-${Date.now().toString().slice(-6)}`,
    };

    setShares((current) => [share, ...current]);
    setSelectedShare(share.id);
    setSelectedReport("");
    alert("Demo share record created. No real link or external notification was generated.");
  }

  function revokeShare(id: number) {
    setShares((current) => current.map((share) =>
      share.id === id ? { ...share, access: "Revoked" } : share
    ));
  }

  const bossShares = shares.filter((share) => share.access === "Active");

  return (
    <div className="report-sharing-module">
      <header className="report-sharing-header">
        <div>
          <span className="eyebrow">REPORT DISTRIBUTION</span>
          <h1>Report Sharing</h1>
          <p>Share approved statewide reports with the Boss through controlled read-only access.</p>
        </div>
        <span className="live-label">DEMO DATA</span>
      </header>

      <section className="panel report-sharing-role">
        <label>
          Demo view
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="senior_supervisor">Senior Supervisor</option>
            <option value="boss">Boss — Read only</option>
          </select>
        </label>
        <span>Production access must be determined by the authenticated account, not this selector.</span>
      </section>

      <div className="report-sharing-summary">
        <article className="panel"><span>Approved reports available</span><strong>{availableReports.length}</strong></article>
        <article className="panel"><span>Active share records</span><strong>{activeShares}</strong></article>
        <article className="panel"><span>Revoked share records</span><strong>{shares.filter((share) => share.access === "Revoked").length}</strong></article>
      </div>

      {role === "senior_supervisor" ? (
        <>
          <section className="panel report-share-form">
            <div className="panel-heading">
              <div><h2>Create report share</h2><p>Only approved reports can be selected.</p></div>
            </div>

            <label>
              Approved report
              <select value={selectedReport} onChange={(event) => setSelectedReport(event.target.value)}>
                <option value="">Select an approved report</option>
                {availableReports.map((report) => (
                  <option key={report.id} value={report.id}>{report.title} — {report.period}</option>
                ))}
              </select>
            </label>

            <div className="report-share-form-grid">
              <label>
                Intended recipient
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Office of the Boss" />
              </label>
              <label>
                Recipient email
                <input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="Enter authorized recipient email" />
              </label>
              <label>
                Link expiry
                <select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                </select>
              </label>
            </div>

            <div className="plans-notice">
              The selected expiry is a prototype setting only. No secure link is created, no email is sent, and no actual access permission is granted.
            </div>

            <div className="report-share-actions">
              <button type="button" className="primary-button" onClick={createShare}>Create demo share record</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Share history</h2><p>Review active and revoked share records.</p></div></div>
            {shares.length === 0 ? (
              <div className="plan-empty">No reports have been shared in this session.</div>
            ) : (
              <div className="report-share-list">
                {shares.map((share) => (
                  <article className="report-share-card" key={share.id}>
                    <div>
                      <strong>{share.reportTitle}</strong>
                      <span>Recipient: {share.recipient}</span>
                      <span>Shared by: {share.sharedBy}</span>
                      <span>Shared at: {share.sharedAt}</span>
                      <span>Reference: {share.reference}</span>
                    </div>
                    <div className="report-share-card-actions">
                      <span className={`status-badge ${share.access === "Active" ? "approved" : "returned"}`}>{share.access}</span>
                      {share.access === "Active" && (
                        <button type="button" className="secondary-button" onClick={() => revokeShare(share.id)}>Revoke demo access</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="panel-heading"><div><h2>Reports shared with the Boss</h2><p>Read-only report list. No editing or approval controls.</p></div></div>
          {bossShares.length === 0 ? (
            <div className="plan-empty">No reports have been shared with the Boss in this demo session.</div>
          ) : (
            <div className="report-share-list">
              {bossShares.map((share) => (
                <article className="report-share-card" key={share.id}>
                  <div>
                    <strong>{share.reportTitle}</strong>
                    <span>Shared by: {share.sharedBy}</span>
                    <span>Shared at: {share.sharedAt}</span>
                    <span>Reference: {share.reference}</span>
                  </div>
                  <span className="status-badge approved">Read only</span>
                </article>
              ))}
            </div>
          )}
          <p className="campaign-monitoring-note">This prototype only displays shares created in the same browser session. Production Boss access must be restricted to approved reports assigned to the Boss.</p>
        </section>
      )}

      {selectedShare !== null && role === "senior_supervisor" && (
        <p className="report-share-selection">Latest demo share record: {selectedShare}. No public URL has been generated.</p>
      )}

      <div className="plans-notice">
        <strong>Security boundary:</strong> This is a UI prototype. Production needs cryptographically random share tokens, server-side expiry and revocation checks, access logging, private file storage, and a read-only report endpoint. Never expose database file paths or use a public storage bucket for confidential reports.
      </div>
    </div>
  );
}
