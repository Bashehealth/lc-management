"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function dateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

type Checkin = {
  id: string;
  checkin_date: string;
  checked_in_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
};

export default function CampaignCheckin({ userId, lgaId }: { userId: string; lgaId: string | null }) {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deadline, setDeadline] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!lgaId) { setError("Your account is not assigned to an LGA."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const db = createClient();
    const [settingsResult, historyResult] = await Promise.all([
      db.from("campaign_settings").select("checkin_deadline,timezone,checkin_enabled").eq("lga_id", lgaId).maybeSingle(),
      db.from("campaign_checkins").select("id,checkin_date,checked_in_at,latitude,longitude,accuracy_meters").eq("lga_id", lgaId).order("checked_in_at", { ascending: false }).limit(100),
    ]);
    const failure = settingsResult.error ?? historyResult.error;
    if (failure) setError(failure.message);
    else if (!settingsResult.data) setError("Campaign check-in is not configured for this LGA.");
    else {
      setDeadline(String(settingsResult.data.checkin_deadline).slice(0, 5));
      setTimeZone(settingsResult.data.timezone);
      setEnabled(settingsResult.data.checkin_enabled);
      setCheckins((historyResult.data ?? []) as Checkin[]);
    }
    setLoading(false);
  }, [lgaId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  function captureLocation() {
    if (!navigator.geolocation) {
      setNotice("Geolocation is not supported by this browser.");
      return;
    }

    setCapturing(true);
    setNotice("Requesting your location permission...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setCapturing(false);
        setNotice("Location captured successfully. Review the details before submitting.");
      },
      (error) => {
        setCapturing(false);
        setNotice(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Enable location access in your browser and try again."
            : error.code === error.TIMEOUT
              ? "Location request timed out. Please try again."
              : "Unable to determine your location. Please try again."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function submitCheckin() {
    if (!location) {
      setNotice("Capture your location before submitting a check-in.");
      return;
    }
    if (!lgaId || !userId || !timeZone || !enabled || saving) return;

    const now = new Date();
    const date = dateKey(now, timeZone);

    if (checkins.some((item) => item.checkin_date === date)) {
      setNotice("A check-in has already been recorded for today.");
      return;
    }

    setSaving(true); setError(""); setNotice("");
    const { error: insertError } = await createClient().from("campaign_checkins").insert({
      lga_id: lgaId,
      checkin_date: date,
      checked_in_at: now.toISOString(),
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy_meters: location.accuracy,
      location_source: "manual",
      submitted_by: userId,
    });
    if (insertError) setError(insertError.message);
    else { setLocation(null); setNotice("Check-in saved."); await load(); }
    setSaving(false);
  }

  const today = timeZone ? dateKey(new Date(), timeZone) : "";
  const todaysCheckin = checkins.find((item) => item.checkin_date === today);
  const statusFor = (item: Checkin) => new Date(item.checked_in_at).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) <= deadline ? "On time" : "Late";

  return (
    <div className="checkin-module">
      {(error || notice) && (
        <div className="plans-notice">
          <span role={error ? "alert" : "status"}>{error || notice}</span>
          <button type="button" onClick={() => { setNotice(""); setError(""); }}>×</button>
        </div>
      )}

      <div className="checkin-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Campaign Check-in</h2>
          <p>Record your field check-in with timestamp and location evidence.</p>
        </div>
          <span className="live-label">LGA RECORDS</span>
      </div>

      <div className="checkin-summary-grid">
        <article className="plan-summary-card">
          <span>Today&apos;s check-in</span>
          <strong>{loading ? "…" : todaysCheckin ? "1" : "0"}</strong>
          <small>Persistent submissions</small>
        </article>
        <article className="plan-summary-card">
          <span>Submission deadline</span>
          <strong>{deadline}</strong>
          <small>Configured daily deadline</small>
        </article>
        <article className="plan-summary-card">
          <span>Location accuracy</span>
          <strong>{location ? `${Math.round(location.accuracy)}m` : "--"}</strong>
          <small>GPS accuracy estimate</small>
        </article>
        <article className="plan-summary-card">
          <span>Check-in status</span>
          <strong className="checkin-status-value">
            {todaysCheckin ? statusFor(todaysCheckin) : "Pending"}
          </strong>
          <small>Today&apos;s submission</small>
        </article>
      </div>

      <section className="panel checkin-capture-panel">
        <div className="panel-heading">
          <div>
            <h3>Daily field check-in</h3>
            <p>Capture your current location to record your check-in.</p>
          </div>
          <span className="live-label">LOCATION REQUIRED</span>
        </div>

        <div className="checkin-instructions">
          <div className="checkin-instruction-icon">◎</div>
          <div>
            <strong>Location permission</strong>
            <p>Your browser will ask for permission to access your current location. Location is captured only when you request it.</p>
          </div>
        </div>

        <div className="checkin-location-card">
          <div className="checkin-location-top">
            <div>
              <span className="eyebrow">CURRENT LOCATION</span>
              <h3>{location ? "Location captured" : "Location not captured"}</h3>
            </div>
            <span className={location ? "checkin-location-good" : "checkin-location-pending"}>
              {location ? "Captured" : "Awaiting permission"}
            </span>
          </div>

          {location ? (
            <div className="checkin-coordinates">
              <div>
                <span>Latitude</span>
                <strong>{location.latitude.toFixed(6)}</strong>
              </div>
              <div>
                <span>Longitude</span>
                <strong>{location.longitude.toFixed(6)}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{Math.round(location.accuracy)} metres</strong>
              </div>
            </div>
          ) : (
            <p className="checkin-empty-location">
              No coordinates have been captured. Select the button below to request location access.
            </p>
          )}

          <div className="checkin-location-actions">
            <button
              className="secondary-button"
              onClick={captureLocation}
              disabled={capturing}
            >
              {capturing ? "Capturing location..." : location ? "Refresh location" : "Capture my location"}
            </button>

            <button
              className="primary-button"
              type="button"
              onClick={() => void submitCheckin()}
              disabled={!location || !enabled || !lgaId || saving || Boolean(todaysCheckin)}
            >
              {saving ? "Saving…" : "Submit check-in →"}
            </button>
          </div>
        </div>

        <div className="checkin-deadline-note">
          <strong>Daily submission deadline</strong>
          <p>Submissions after the configured deadline are flagged for supervisor review. A late check-in is not automatically rejected.</p>
          <label>
            Configured deadline
            <input
              type="time"
              value={deadline}
              readOnly
            />
          </label>
          {!enabled && <p role="status">Check-ins are currently disabled for this LGA.</p>}
        </div>
      </section>

      <section className="panel checkin-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Check-in history</h3>
            <p>Saved check-in records for this LGA</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        </div>

        {loading ? <div className="plan-empty">Loading check-in history…</div> : checkins.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">◎</div>
            <strong>No check-ins recorded</strong>
            <p>Your saved check-ins will appear here.</p>
          </div>
        ) : (
          checkins.map((item) => (
            <article className="checkin-history-row" key={item.id}>
              <div>
                <strong>{item.checkin_date}</strong>
                <span>{new Date(item.checked_in_at).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div>
                <span>GPS coordinates</span>
                <strong>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{item.accuracy_meters == null ? "—" : `${Math.round(item.accuracy_meters)}m`}</strong>
              </div>
              <span className={`plan-status ${statusFor(item) === "On time" ? "plan-status-completed" : "plan-status-returned"}`}>
                {statusFor(item)}
              </span>
            </article>
          ))
        )}
      </section>

      <div className="checkin-privacy-note">
        <strong>Location privacy</strong>
        <p>Location is requested only during an intentional check-in. This interface does not implement background or continuous tracking. Location accuracy and reported coordinates are subject to device and browser limitations.</p>
      </div>
    </div>
  );
}
