"use client";

import { useState } from "react";

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type Checkin = {
  id: number;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  status: string;
};

export default function CampaignCheckin() {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState("");
  const [deadline, setDeadline] = useState("10:30");

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

  function submitCheckin() {
    if (!location) {
      setNotice("Capture your location before submitting a check-in.");
      return;
    }

    const now = new Date();
    const date = getLocalDateKey(now);

    if (checkins.some((item) => item.date === date)) {
      setNotice("A check-in has already been recorded for today.");
      return;
    }

    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

    const status = time > deadline ? "Late" : "On time";

    setCheckins((previous) => [{
      id: Date.now(),
      date,
      time,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      status,
    }, ...previous]);

    setLocation(null);
    setNotice("Check-in recorded in demo mode. Database submission is not connected.");
  }

  return (
    <div className="checkin-module">
      {notice && (
        <div className="plans-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="checkin-heading">
        <div>
          <span className="eyebrow">FUNE LOCAL GOVERNMENT AREA</span>
          <h2>Campaign Check-in</h2>
          <p>Record your field check-in with timestamp and location evidence.</p>
        </div>
        <span className="plan-draft-badge">DEMO MODE</span>
      </div>

      <div className="checkin-summary-grid">
        <article className="plan-summary-card">
          <span>Today's check-in</span>
          <strong>{checkins.length ? "1" : "0"}</strong>
          <small>Submitted records</small>
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
            {checkins.length ? checkins[0].status : "Pending"}
          </strong>
          <small>Today's submission</small>
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
              onClick={submitCheckin}
              disabled={!location || checkins.some((item) => item.date === getLocalDateKey())}
            >
              Submit check-in →
            </button>
          </div>
        </div>

        <div className="checkin-deadline-note">
          <strong>Daily submission deadline</strong>
          <p>Submissions after the configured deadline are flagged for supervisor review. A late check-in is not automatically rejected.</p>
          <label>
            Demo deadline
            <input
              type="time"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel checkin-history-panel">
        <div className="panel-heading">
          <div>
            <h3>Check-in history</h3>
            <p>Previously submitted check-in records</p>
          </div>
          <span className="live-label">{checkins.length} RECORDS</span>
        </div>

        {checkins.length === 0 ? (
          <div className="plan-empty">
            <div className="working-empty-icon">◎</div>
            <strong>No check-ins recorded</strong>
            <p>Your submitted check-ins will appear here.</p>
          </div>
        ) : (
          checkins.map((item) => (
            <article className="checkin-history-row" key={item.id}>
              <div>
                <strong>{item.date}</strong>
                <span>{item.time}</span>
              </div>
              <div>
                <span>GPS coordinates</span>
                <strong>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{Math.round(item.accuracy)}m</strong>
              </div>
              <span className={`plan-status ${item.status === "On time" ? "plan-status-completed" : "plan-status-returned"}`}>
                {item.status}
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
