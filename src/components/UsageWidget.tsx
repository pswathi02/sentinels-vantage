'use client';

import { useCallback, useEffect, useState } from 'react';

interface UsageReport {
  anthropic: {
    configured: boolean;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    budget: number | null;
    remaining: number | null;
    pctUsed: number | null;
    console: string;
  };
  brightdata: {
    configured: boolean;
    requests: number;
    budget: number | null;
    remaining: number | null;
    pctUsed: number | null;
    console: string;
  };
  since: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Meter({ pct, tone }: { pct: number | null; tone: string }) {
  if (pct == null) return null;
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warn)' : tone;
  return (
    <div className="uw-meter">
      <div className="uw-meter-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function UsageWidget() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/usage')
      .then((r) => r.json())
      .then((d: UsageReport) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div className="uw-root">
      {open && data && (
        <div className="uw-panel" role="dialog" aria-label="API usage">
          <div className="uw-head">
            <span>API usage</span>
            <button className="uw-refresh" onClick={load} aria-label="Refresh">
              {loading ? '…' : '⟳'}
            </button>
          </div>

          {/* Anthropic */}
          <div className="uw-row">
            <div className="uw-row-head">
              <span className="uw-dot" style={{ background: 'var(--purple)' }} />
              <span className="uw-name">Anthropic</span>
              <span className={`uw-tag ${data.anthropic.configured ? 'on' : 'off'}`}>
                {data.anthropic.configured ? 'live' : 'no key'}
              </span>
            </div>
            <Meter pct={data.anthropic.pctUsed} tone="var(--purple)" />
            <div className="uw-stat">
              {data.anthropic.budget != null ? (
                <>
                  <strong>{fmt(data.anthropic.remaining ?? 0)}</strong> of {fmt(data.anthropic.budget)} tokens left
                </>
              ) : (
                <>
                  <strong>{fmt(data.anthropic.totalTokens)}</strong> tokens used · {data.anthropic.requests} calls
                </>
              )}
            </div>
            <a className="uw-link" href={data.anthropic.console} target="_blank" rel="noreferrer">
              View full usage →
            </a>
          </div>

          {/* Bright Data */}
          <div className="uw-row">
            <div className="uw-row-head">
              <span className="uw-dot" style={{ background: 'var(--accent)' }} />
              <span className="uw-name">Bright Data</span>
              <span className={`uw-tag ${data.brightdata.configured ? 'on' : 'off'}`}>
                {data.brightdata.configured ? 'live' : 'no key'}
              </span>
            </div>
            <Meter pct={data.brightdata.pctUsed} tone="var(--accent)" />
            <div className="uw-stat">
              {data.brightdata.budget != null ? (
                <>
                  <strong>{data.brightdata.remaining ?? 0}</strong> of {data.brightdata.budget} requests left
                </>
              ) : (
                <>
                  <strong>{data.brightdata.requests}</strong> requests this session
                </>
              )}
            </div>
            <a className="uw-link" href={data.brightdata.console} target="_blank" rel="noreferrer">
              View full usage →
            </a>
          </div>

          <div className="uw-foot">
            Counts this app&apos;s consumption since{' '}
            {new Date(data.since).toLocaleDateString()}. Set <code>ANTHROPIC_TOKEN_BUDGET</code> /{' '}
            <code>BRIGHTDATA_REQUEST_BUDGET</code> in <code>.env.local</code> to show remaining.
          </div>
        </div>
      )}

      <button
        className="uw-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="API usage"
        title="API usage"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21a9 9 0 1 1 9-9" strokeLinecap="round" />
          <path d="M12 12l5-3" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        <span>usage</span>
      </button>
    </div>
  );
}
