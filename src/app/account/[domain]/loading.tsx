'use client';

import { useEffect, useState } from 'react';

/**
 * Route-level loading UI. Next.js renders this automatically while the
 * /account/[domain] server component is awaiting buildDossier() in live mode.
 *
 * It's a faux-progress affordance: we don't get real pipeline callbacks here,
 * so we creep a progress bar through the *actual* pipeline stages (Bright Data
 * ingest → Claude extract → graph merge → memo) and cap near the top until the
 * dashboard mounts and replaces this view. Meet VANTA, the time-travel scout.
 */

const STAGES = [
  { pct: 12, label: 'Waking the Vantage Scout…' },
  { pct: 30, label: 'Scanning the open web via Bright Data…' },
  { pct: 50, label: 'Capturing time-stamped snapshots…' },
  { pct: 70, label: 'Extracting entities with Claude…' },
  { pct: 85, label: 'Weaving the temporal knowledge graph…' },
  { pct: 95, label: 'Synthesizing the diligence memo…' },
];

export default function AccountLoading() {
  const [stage, setStage] = useState(0);
  const [pct, setPct] = useState(4);

  // Advance through the named stages on a timer.
  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // Smoothly creep the bar toward the current stage's ceiling.
  useEffect(() => {
    const target = STAGES[stage].pct;
    const id = setInterval(() => {
      setPct((p) => (p < target ? Math.min(target, p + 1) : p));
    }, 40);
    return () => clearInterval(id);
  }, [stage]);

  return (
    <main className="shell">
      <div className="tama">
        <div className="tama-stage">
          {/* orbiting graph dots echo the radial knowledge graph */}
          <div className="tama-orbit">
            <span className="tama-dot d1" />
            <span className="tama-dot d2" />
            <span className="tama-dot d3" />
            <span className="tama-dot d4" />
          </div>

          {/* VANTA — the pixel time-scout */}
          <svg className="tama-scout" viewBox="0 0 120 120" width="150" height="150">
            {/* radar antenna */}
            <line x1="60" y1="20" x2="60" y2="6" className="tama-ant" />
            <circle cx="60" cy="5" r="4" className="tama-blip" />
            {/* body */}
            <rect x="24" y="26" width="72" height="72" rx="20" className="tama-body" />
            <rect x="24" y="26" width="72" height="72" rx="20" className="tama-body-edge" />
            {/* eyes */}
            <g className="tama-eyes">
              <circle cx="46" cy="54" r="9" className="tama-eye-white" />
              <circle cx="74" cy="54" r="9" className="tama-eye-white" />
              <circle cx="48" cy="56" r="4" className="tama-pupil" />
              <circle cx="76" cy="56" r="4" className="tama-pupil" />
            </g>
            {/* clock belly */}
            <circle cx="60" cy="80" r="13" className="tama-clock" />
            <line x1="60" y1="80" x2="60" y2="72" className="tama-hand-h" />
            <line x1="60" y1="80" x2="67" y2="80" className="tama-hand-m" />
            <circle cx="60" cy="80" r="1.6" className="tama-clock-pin" />
            {/* feet */}
            <rect x="38" y="96" width="14" height="8" rx="3" className="tama-foot" />
            <rect x="68" y="96" width="14" height="8" rx="3" className="tama-foot" />
          </svg>
          <div className="tama-shadow" />
        </div>

        <div className="tama-name">VANTA is time-travelling the open web</div>
        <div className="tama-status">{STAGES[stage].label}</div>

        <div className="tama-bar">
          <div className="tama-fill" style={{ width: `${pct}%` }} />
          <div className="tama-pct">{pct}%</div>
        </div>

        <div className="tama-hint">
          Live mode · pulling fresh data across the lookback window. Pre-cached targets load
          instantly — this one is being scraped &amp; extracted right now.
        </div>
      </div>
    </main>
  );
}
