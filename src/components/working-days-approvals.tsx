"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ClaimStatus = "claimed" | "approved" | "returned" | "rejected";
type Claim = { id: string; lga_id: string; working_date: string; claim_note: string | null; status: ClaimStatus; submitted_by: string; submitted_at: string; approved_by: string | null; approved_at: string | null };
type Profile = { id: string; full_name: string; role: string };
type Lga = { id: string; name: string };
type Event = { id: string; working_day_record_id: string; action: string; note: string | null; acted_at: string; acted_by: string };
type Overage = { id: string; lga_id: string; calendar_month: string; additional_days: number; reason: string };

export default function WorkingDaysApprovals({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [lgas, setLgas] = useState<Lga[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [overages, setOverages] = useState<Overage[]>([]);
  const [allocation, setAllocation] = useState(15);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState("All");
  const [selectedLga, setSelectedLga] = useState("All");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [activeClaim, setActiveClaim] = useState<string | null>(null);
  const [extraDays, setExtraDays] = useState<Record<string, string>>({});
  const [extraReasons, setExtraReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const start = `${month}-01`;
    const endDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const end = `${month}-${String(endDay).padStart(2, "0")}`;
    const [claimResult, lgaResult, policyResult, overageResult] = await Promise.all([
      supabase.from("working_day_records").select("id, lga_id, working_date, claim_note, status, submitted_by, submitted_at, approved_by, approved_at").gte("working_date", start).lte("working_date", end).order("working_date", { ascending: false }),
      supabase.from("lgas").select("id, name").order("name"),
      supabase.from("operational_policy_settings").select("monthly_working_day_allocation").lte("effective_from", start).order("effective_from", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("working_day_overage_authorizations").select("id, lga_id, calendar_month, additional_days, reason").eq("calendar_month", start),
    ]);
    if (claimResult.error) setError(claimResult.error.message);
    else {
      const rows = (claimResult.data || []) as Claim[]; setClaims(rows);
      const ids = [...new Set(rows.map((r) => r.submitted_by))];
      const recordIds = rows.map((r) => r.id);
      if (ids.length) {
        const profileResult = await supabase.from("profiles").select("id, full_name, role").in("id", ids);
        if (profileResult.error) setError(profileResult.error.message);
        else setProfiles(Object.fromEntries(((profileResult.data || []) as Profile[]).map((p) => [p.id, p])));
      } else setProfiles({});
      if (recordIds.length) {
        const eventResult = await supabase.from("working_day_approvals").select("id, working_day_record_id, action, note, acted_at, acted_by").in("working_day_record_id", recordIds).order("acted_at", { ascending: false });
        if (eventResult.error) setError((current) => current || eventResult.error.message);
        else {
          const eventRows = (eventResult.data || []) as Event[];
          setEvents(eventRows);
          const reviewerIds = [...new Set(eventRows.map((event) => event.acted_by))];
          if (reviewerIds.length) {
            const reviewerResult = await supabase.from("profiles").select("id, full_name, role").in("id", reviewerIds);
            if (reviewerResult.error) setError((current) => current || reviewerResult.error.message);
            else setProfiles((current) => ({ ...current, ...Object.fromEntries(((reviewerResult.data || []) as Profile[]).map((profile) => [profile.id, profile])) }));
          }
        }
      } else setEvents([]);
    }
    if (lgaResult.error) setError((current) => current || lgaResult.error.message); else setLgas((lgaResult.data || []) as Lga[]);
    if (policyResult.error) setError((current) => current || policyResult.error.message); else if (policyResult.data) setAllocation(policyResult.data.monthly_working_day_allocation);
    if (overageResult.error) setError((current) => current || overageResult.error.message); else setOverages((overageResult.data || []) as Overage[]);
    setLoading(false);
  }, [month, supabase]);

  useEffect(() => { void load(); }, [load]);

  const filteredClaims = useMemo(() => claims.filter((claim) => (filter === "All" || claim.status === filter) && (selectedLga === "All" || claim.lga_id === selectedLga)), [claims, filter, selectedLga]);
  const pendingCount = claims.filter((c) => c.status === "claimed").length;
  const approvedCount = claims.filter((c) => c.status === "approved").length;
  const returnedCount = claims.filter((c) => c.status === "returned").length;
  const approvedByLga = (lgaId: string) => claims.filter((c) => c.lga_id === lgaId && c.status === "approved").length;
  const overageFor = (lgaId: string) => overages.find((o) => o.lga_id === lgaId);

  async function decideClaim(id: string, action: "approved" | "returned") {
    const note = (comments[id] || "").trim();
    if (action === "returned" && !note) { setError("A reason is required before returning a claim."); return; }
    setSavingId(id); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("review_working_day_claim", { p_record_id: id, p_action: action, p_note: note || null });
    if (rpcError) setError(rpcError.message);
    else { setNotice(action === "approved" ? "Claim approved and approval history saved." : "Claim returned and review history saved."); setActiveClaim(null); setComments((current) => ({ ...current, [id]: "" })); await load(); }
    setSavingId(null);
  }

  async function authorizeExtraDays(lgaId: string) {
    const days = Number(extraDays[lgaId]); const reason = (extraReasons[lgaId] || "").trim();
    if (!Number.isInteger(days) || days < 1 || days > 15) { setError("Enter between 1 and 15 additional days."); return; }
    if (!reason) { setError("A reason is required for additional-day authorization."); return; }
    setError(""); setNotice("");
    const { error: insertError } = await supabase.from("working_day_overage_authorizations").insert({ lga_id: lgaId, calendar_month: `${month}-01`, additional_days: days, authorized_by: userId, reason });
    if (insertError) setError(insertError.message);
    else { setNotice("Additional days authorized and recorded in the database."); setExtraDays((s) => ({ ...s, [lgaId]: "" })); setExtraReasons((s) => ({ ...s, [lgaId]: "" })); await load(); }
  }

  return (
    <div className="working-approvals-module">
      {(error || notice) && <div className="plans-notice" role="status"><span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
      <div className="working-approvals-header"><div><span className="eyebrow">SUPERVISOR WORKSPACE</span><h1>Working Days Approvals</h1><p>Review LGA claims and maintain traceable approval records.</p></div><span className="live-label">LIVE DATABASE</span></div>
      <div className="working-approvals-summary"><div className="panel"><span>Pending review</span><strong>{pendingCount}</strong></div><div className="panel"><span>Approved claims</span><strong>{approvedCount}</strong></div><div className="panel"><span>Returned claims</span><strong>{returnedCount}</strong></div><div className="panel"><span>Monthly allocation</span><strong>{allocation} days</strong></div></div>
      <section className="panel"><div className="panel-heading"><div><h2>Monthly LGA allocation overview</h2><p>Approved claims and recorded additional-day authorizations.</p></div><label>Reporting month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div>
        <div className="working-allocation-grid">{lgas.map((lga) => { const approved = approvedByLga(lga.id); const auth = overageFor(lga.id); const extra = auth?.additional_days || 0; return <div className="working-allocation-card" key={lga.id}><strong>{lga.name}</strong><span>{approved} / {allocation + extra} approved days</span><div className="allocation-track"><span style={{ width: `${Math.min(100, approved / Math.max(1, allocation + extra) * 100)}%` }} /></div><small>{Math.max(0, allocation + extra - approved)} days remaining</small>{auth ? <small>Additional days authorized: {extra}. {auth.reason}</small> : <div className="working-extra-authorization"><label>Additional days<input type="number" min="1" max="15" value={extraDays[lga.id] || ""} onChange={(e) => setExtraDays((s) => ({ ...s, [lga.id]: e.target.value }))} /></label><label>Authorization reason<textarea rows={2} value={extraReasons[lga.id] || ""} onChange={(e) => setExtraReasons((s) => ({ ...s, [lga.id]: e.target.value }))} placeholder="Why are extra days required?" /></label><button className="secondary-button" type="button" onClick={() => void authorizeExtraDays(lga.id)}>Authorize additional days</button></div>}</div>; })}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Claim review queue</h2><p>Each claim is reviewed individually. You cannot approve your own claim.</p></div><div className="working-approval-filters"><select value={selectedLga} onChange={(e) => setSelectedLga(e.target.value)}><option value="All">All LGAs</option>{lgas.map((lga) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}</select><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="All">All statuses</option><option value="claimed">Pending</option><option value="approved">Approved</option><option value="returned">Returned</option><option value="rejected">Rejected</option></select></div></div>
        {loading ? <div className="plan-empty">Loading claims…</div> : <div className="working-claim-list">{filteredClaims.map((claim) => { const lga = lgas.find((item) => item.id === claim.lga_id); const officer = profiles[claim.submitted_by]; const ownClaim = claim.submitted_by === userId; const claimEvents = events.filter((e) => e.working_day_record_id === claim.id); return <article className="working-claim-card" key={claim.id}><div className="working-claim-top"><div><h3>{lga?.name || "Unknown LGA"} LGA</h3><p>{officer?.full_name || "Unknown officer"} · {claim.working_date} · Submitted {new Date(claim.submitted_at).toLocaleString()}</p></div><span className={`status-badge ${claim.status}`}>{claim.status === "claimed" ? "Pending" : claim.status[0].toUpperCase() + claim.status.slice(1)}</span></div><p>{claim.claim_note || "No work note supplied."}</p>{claimEvents.length > 0 && <div className="working-review-history"><strong>Review history</strong>{claimEvents.map((event) => <p key={event.id}>{event.action.toUpperCase()} · {profiles[event.acted_by]?.full_name || "Supervisor"} · {new Date(event.acted_at).toLocaleString()} · {event.note || "No comment"}</p>)}</div>}{claim.status === "claimed" && <>{ownClaim ? <p className="plans-notice">You submitted this claim. Another supervisor must review it.</p> : <><button className="secondary-button" type="button" onClick={() => setActiveClaim(activeClaim === claim.id ? null : claim.id)}>{activeClaim === claim.id ? "Close review" : "Review claim"}</button>{activeClaim === claim.id && <div className="working-claim-review-form"><label>Review comment<textarea value={comments[claim.id] || ""} onChange={(e) => setComments((s) => ({ ...s, [claim.id]: e.target.value }))} placeholder="Add a note. A reason is required to return a claim." /></label><div className="working-claim-actions"><button type="button" className="secondary-button" disabled={savingId === claim.id} onClick={() => void decideClaim(claim.id, "returned")}>Return claim</button><button type="button" className="primary-button" disabled={savingId === claim.id} onClick={() => void decideClaim(claim.id, "approved")}>{savingId === claim.id ? "Saving…" : "Approve claim"}</button></div></div>}</>}</>}</article>; })}{filteredClaims.length === 0 && <div className="plan-empty">No claims match these filters for {month}.</div>}</div>}
      </section>
      <div className="plans-notice"><strong>Payment control:</strong> This module records attendance claims and supervisor decisions. It does not calculate or issue payroll payments.</div>
    </div>
  );
}
