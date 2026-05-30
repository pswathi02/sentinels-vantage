'use client';

import { useEffect, useState } from 'react';

/**
 * Route-level loading UI. Next.js renders this automatically while the
 * /account/[domain] server component is awaiting buildDossier() in live mode.
 *
 * It's a faux-progress affordance: we don't get real pipeline callbacks here,
 * so we creep a progress bar through the *actual* pipeline stages (Bright Data
 * ingest → Claude extract → graph merge → memo) and cap near the top until the
 * dashboard mounts and replaces this view. Meet Vantagent, the diligence scout.
 */

const STAGES = [
  { pct: 12, label: 'Briefing Vantagent…' },
  { pct: 30, label: 'Scanning the open web via Bright Data…' },
  { pct: 50, label: 'Capturing time-stamped snapshots…' },
  { pct: 70, label: 'Extracting entities with Claude…' },
  { pct: 85, label: 'Weaving the temporal knowledge graph…' },
  { pct: 95, label: 'Synthesizing the diligence memo…' },
];

/**
 * Rotating "did you know" lines so the wait isn't a blank progress bar. They
 * teach how to read the dashboard and surface the diligence patterns the tool
 * looks for. `{co}` is replaced with the company name parsed from the URL.
 */
const FACTS = [
  'Tip: on the next screen, drag the time slider to watch {co}’s story unfold week by week.',
  'Every fact you’ll see links straight to the article it was scraped from — no unsourced claims.',
  'Did you know? Two senior exits inside 90 days is a classic distress signal.',
  'A CMO departure often precedes a public sentiment dip by roughly 45 days.',
  'We cross-check news, court dockets, SEC filings and review sites — then place each on a timeline.',
  'Litigation spikes frequently trail a leadership shake-up by a quarter or two.',
  'Quiet pricing-page edits can be an early tell for margin pressure.',
  'Layoffs usually surface in the press before they ever hit a company blog.',
  'Hover any node on the next screen to see the exact quote behind it.',
];

/** Best-effort company label from the /account/<domain> URL, title-cased. */
function companyFromPath(): string {
  if (typeof window === 'undefined') return 'this company';
  const seg = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() ?? '');
  const base = seg
    .replace(/\.(com|io|ai|co|net|org|gov)$/i, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  if (!base) return 'this company';
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AccountLoading() {
  const [stage, setStage] = useState(0);
  const [pct, setPct] = useState(4);
  const [fact, setFact] = useState(0);
  // Set client-side (in an effect) so the first paint matches the server and
  // doesn't trip a hydration mismatch.
  const [company, setCompany] = useState('this company');
  useEffect(() => setCompany(companyFromPath()), []);

  // Advance through the named stages on a timer.
  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // Rotate the "did you know" line on its own, slower cadence.
  useEffect(() => {
    const id = setInterval(() => setFact((f) => (f + 1) % FACTS.length), 3800);
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
          {/* the diligence vocabulary orbits the scout — same glyphs as the graph */}
          <div className="tama-orbit">
            <span className="tama-ico i1" title="people">
              <i>👤</i>
            </span>
            <span className="tama-ico i2" title="litigation">
              <i>⚖️</i>
            </span>
            <span className="tama-ico i3" title="filings">
              <i>📄</i>
            </span>
            <span className="tama-ico i4" title="companies">
              <i>🏢</i>
            </span>
          </div>

          {/* Vantagent — the IB/PE diligence scout in a suit */}
          <svg className="tama-scout" viewBox="0 0 120 120" width="150" height="150">
            {/* radar antenna */}
            <line x1="60" y1="20" x2="60" y2="6" className="tama-ant" />
            <circle cx="60" cy="5" r="4" className="tama-blip" />
            {/* head + suit body */}
            <rect x="24" y="24" width="72" height="74" rx="20" className="tama-body" />
            <rect x="24" y="24" width="72" height="74" rx="20" className="tama-body-edge" />
            {/* eyes */}
            <g className="tama-eyes">
              <circle cx="46" cy="50" r="9" className="tama-eye-white" />
              <circle cx="74" cy="50" r="9" className="tama-eye-white" />
              <circle cx="48" cy="52" r="4" className="tama-pupil" />
              <circle cx="76" cy="52" r="4" className="tama-pupil" />
            </g>
            {/* white shirt collar */}
            <polygon points="48,64 60,67 54,77" className="tama-collar" />
            <polygon points="72,64 60,67 66,77" className="tama-collar" />
            {/* necktie — the corporate touch */}
            <polygon points="56,66 64,66 60,73" className="tama-knot" />
            <polygon points="60,73 65,87 60,92 55,87" className="tama-tie" />
            {/* feet */}
            <rect x="38" y="96" width="14" height="8" rx="3" className="tama-foot" />
            <rect x="68" y="96" width="14" height="8" rx="3" className="tama-foot" />
          </svg>
          <div className="tama-shadow" />
        </div>

        <div className="tama-name">
          Vantagent is building the dossier on {company}
        </div>
        <div className="tama-status">{STAGES[stage].label}</div>

        <div className="tama-bar">
          <div className="tama-fill" style={{ width: `${pct}%` }} />
          <div className="tama-pct">{pct}%</div>
        </div>

        <div className="tama-hint" key={fact}>
          {FACTS[fact].replace('{co}', company)}
        </div>
      </div>
    </main>
  );
}
