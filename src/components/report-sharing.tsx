"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Report = { id: string; report_type: string; period_start: string; period_end: string; status: string; state_id: string | null };
type Share = { id: string; report_id: string; recipient_label: string; created_by: string; token_hint: string; expires_at: string; revoked_at: string | null; created_at: string };

export default function ReportSharing() {
  const [reports, setReports] = useState<Report[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [selectedReport, setSelectedReport] = useState("");
  const [recipient, setRecipient] = useState("Office of the Boss");
  const [expiryDays, setExpiryDays] = useState("30");
  const [newShareUrl, setNewShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const db = createClient();
    const [reportResult, shareResult] = await Promise.all([
      db.from("reports").select("id,report_type,period_start,period_end,status,state_id").eq("status", "approved").not("state_id", "is", null).order("period_end", { ascending: false }).limit(100),
      db.from("report_shares").select("id,report_id,recipient_label,created_by,token_hint,expires_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const failure = reportResult.error ?? shareResult.error;
    if (failure) setError(failure.message); else { setReports((reportResult.data ?? []) as Report[]); setShares((shareResult.data ?? []) as Share[]); }
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function createShare() {
    if (!selectedReport || !recipient.trim() || saving) { setNotice("Select an approved report and enter the intended recipient."); return; }
    setSaving(true); setError(""); setNotice(""); setNewShareUrl("");
    const expiresAt = new Date(Date.now() + Number(expiryDays) * 86400000).toISOString();
    const { data, error: rpcError } = await createClient().rpc("create_report_share", { target_report_id: selectedReport, target_recipient_label: recipient.trim(), target_expires_at: expiresAt });
    if (rpcError) setError(rpcError.message);
    else {
      const result = Array.isArray(data) ? data[0] : data;
      setNewShareUrl(result?.token ? `${window.location.origin}/shared-report#${result.token}` : "");
      setSelectedReport(""); setNotice("Secure report share created. Copy its token now; it is shown only once."); await load();
    }
    setSaving(false);
  }

  async function revokeShare(id: string) {
    if (saving) return;
    setSaving(true); setError("");
    const { error: rpcError } = await createClient().rpc("revoke_report_share", { target_share_id: id });
    if (rpcError) setError(rpcError.message); else { setNotice("Share revoked."); await load(); }
    setSaving(false);
  }

  const activeCount = shares.filter((share) => !share.revoked_at && new Date(share.expires_at) > new Date()).length;
  const titleFor = (id: string) => { const report = reports.find((item) => item.id === id); return report ? `${report.report_type.replaceAll("_", " ")} · ${report.period_start}–${report.period_end}` : `Report ${id.slice(0, 8)}`; };

  return <div className="report-sharing-module">
    {(notice || error) && <div className="plans-notice"><span role={error ? "alert" : "status"}>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
    <header className="report-sharing-header"><div><span className="eyebrow">REPORT DISTRIBUTION</span><h1>Management Sharing</h1><p>Create expiring read-only shares for approved reports in your state.</p></div><span className="live-label">SECURE SHARE</span></header>
    <div className="report-sharing-summary"><article className="panel"><span>Approved reports available</span><strong>{loading ? "…" : reports.length}</strong></article><article className="panel"><span>Active share records</span><strong>{activeCount}</strong></article><article className="panel"><span>Revoked / expired</span><strong>{shares.length - activeCount}</strong></article></div>
    <section className="panel report-share-form"><div className="panel-heading"><div><h2>Create report share</h2><p>Only approved reports from your assigned state are available.</p></div></div>
      {loading ? <div className="plan-empty">Loading approved reports…</div> : <><label>Approved report<select value={selectedReport} onChange={(event) => setSelectedReport(event.target.value)}><option value="">Select an approved report</option>{reports.map((report) => <option key={report.id} value={report.id}>{report.report_type.replaceAll("_", " ")} — {report.period_start} to {report.period_end}</option>)}</select></label><div className="report-share-form-grid"><label>Intended recipient<input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label><label>Link expiry<select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label></div><div className="report-share-actions"><button type="button" className="primary-button" onClick={() => void createShare()} disabled={saving || reports.length === 0}>{saving ? "Creating…" : "Create secure share"}</button></div></>}
      {newShareUrl && <div className="plans-notice" role="status"><strong>Copy this one-time secure link:</strong><code>{newShareUrl}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(newShareUrl)}>Copy link</button></div>}
      <p className="campaign-monitoring-note">No email or external notification is sent by this workflow. Deliver the link through your approved secure channel.</p>
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Persistent share history</h2><p>Active, expired and revoked share records</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
      {loading ? <div className="plan-empty">Loading share history…</div> : error ? <div className="plan-empty" role="alert">{error}</div> : shares.length === 0 ? <div className="plan-empty">No reports have been shared.</div> : <div className="report-share-list">{shares.map((share) => { const active = !share.revoked_at && new Date(share.expires_at) > new Date(); return <article className="report-share-card" key={share.id}><div><strong>{titleFor(share.report_id)}</strong><span>Recipient: {share.recipient_label}</span><span>Created: {new Date(share.created_at).toLocaleString()}</span><span>Expires: {new Date(share.expires_at).toLocaleString()}</span><span>Token hint: {share.token_hint}</span></div><div className="report-share-card-actions"><span className={`status-badge ${active ? "approved" : "returned"}`}>{share.revoked_at ? "Revoked" : active ? "Active" : "Expired"}</span>{active && <button type="button" className="secondary-button" onClick={() => void revokeShare(share.id)} disabled={saving}>Revoke</button>}</div></article>; })}</div>}
    </section>
    <div className="plans-notice"><strong>Access boundary:</strong> Boss receives no direct report-table access. Share creation and revocation are server-side RPC operations and must pass state/role checks in the reviewed database proposal.</div>
  </div>;
}
