'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dossier } from '@/lib/pipeline';
import type { TemporalRelation, RelationKind, RiskSeverity } from '@/lib/schema';
import {
  computeDelta,
  buildMemo,
  answerQuestions,
  answerAdHoc,
  type DeltaRow,
  type MemoModel,
  type QA,
} from '@/lib/diligence';

const DAY = 24 * 60 * 60 * 1000;

const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  critical: 'var(--danger)',
  high: 'var(--danger)',
  medium: 'var(--warn)',
  low: 'var(--accent)',
};
const SEVERITY_DOT: Record<RiskSeverity, string> = {
  critical: '🔴',
  high: '🔴',
  medium: '🟠',
  low: '🟡',
};

const DANGER_KINDS = new Set<RelationKind>([
  'departed',
  'laid_off',
  'litigated_with',
  'reviewed_negatively',
]);
const OK_KINDS = new Set<RelationKind>([
  'joined',
  'promoted_to',
  'launched',
  'partnered_with',
  'reviewed_positively',
  'invested_in',
]);

function kindColor(kind: RelationKind): string {
  if (DANGER_KINDS.has(kind)) return 'var(--danger)';
  if (OK_KINDS.has(kind)) return 'var(--ok)';
  return 'var(--accent)';
}

const EVENT_COLOR: Record<string, string> = {
  leadership_change: 'var(--warn)',
  layoff: 'var(--danger)',
  litigation: 'var(--danger)',
  pricing_change: 'var(--accent)',
  sec_filing: 'var(--purple)',
  earnings: 'var(--accent)',
  product_launch: 'var(--ok)',
  mna: 'var(--purple)',
  fundraise: 'var(--ok)',
  press_release: 'var(--text-dim)',
};

// Timeline event glyphs — share the graph's icon vocabulary so a dot on the
// replay strip and its node in the graph read as the same thing.
const EVENT_ICON: Record<string, string> = {
  leadership_change: '👤',
  layoff: '✂️',
  litigation: '⚖️',
  pricing_change: '💲',
  sec_filing: '📄',
  earnings: '📊',
  product_launch: '🚀',
  mna: '🤝',
  fundraise: '💰',
  press_release: '📰',
};
function eventIcon(cat: string): string {
  return EVENT_ICON[cat] ?? '•';
}

// Node ring colour by entity type (keeps node kinds visually distinct).
const TYPE_COLOR: Record<string, string> = {
  company: 'var(--accent)',
  person: '#7c9cff',
  lawsuit: 'var(--danger)',
  document: 'var(--purple)',
  product: 'var(--ok)',
  event: 'var(--warn)',
  default: '#8b98a9',
};

// Company-level self-signals get a readable node label.
const SIGNAL_LABEL: Partial<Record<RelationKind, string>> = {
  laid_off: 'Layoffs',
  reviewed_negatively: 'Glassdoor ↓',
  reviewed_positively: 'Reviews ↑',
  priced_at: 'Pricing',
  launched: 'Launch',
  expanded_to: 'Expansion',
};
function signalLabel(kind: RelationKind): string {
  return SIGNAL_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

// Glyph drawn inside each node so the graph is legible during replay
// without reading the legend.
const TYPE_ICON: Record<string, string> = {
  company: '🏢',
  person: '👤',
  lawsuit: '⚖️',
  document: '📄',
  product: '📦',
  event: '📅',
  default: '•',
};
const SIGNAL_ICON: Partial<Record<RelationKind, string>> = {
  laid_off: '✂️',
  reviewed_negatively: '📉',
  reviewed_positively: '📈',
  priced_at: '💲',
  launched: '🚀',
  expanded_to: '🌐',
};
function signalIcon(kind: RelationKind): string {
  return SIGNAL_ICON[kind] ?? '⚠️';
}

// Friendly labels for the timeline dots (event categories).
const EVENT_LABEL: Record<string, string> = {
  leadership_change: 'Leadership change',
  layoff: 'Layoff',
  litigation: 'Lawsuit',
  pricing_change: 'Pricing change',
  sec_filing: 'SEC filing',
  earnings: 'Earnings',
  product_launch: 'Product launch',
  mna: 'M&A',
  fundraise: 'Fundraise',
  press_release: 'Press release',
};
function eventLabel(cat: string): string {
  return EVENT_LABEL[cat] ?? cat.replace(/_/g, ' ');
}

// Bridge a graph node to the timeline event categories it represents, so hiding
// a node also dims the matching replay markers (they read as the same signal).
const TYPE_EVENT_CAT: Record<string, string> = {
  person: 'leadership_change',
  lawsuit: 'litigation',
  document: 'sec_filing',
  product: 'product_launch',
};
const SIGNAL_EVENT_CAT: Partial<Record<RelationKind, string>> = {
  laid_off: 'layoff',
  priced_at: 'pricing_change',
  launched: 'product_launch',
};

function activeAt(relations: TemporalRelation[], tMs: number): TemporalRelation[] {
  return relations.filter((r) => {
    const from = Date.parse(r.validFrom);
    const to = r.validTo ? Date.parse(r.validTo) : Infinity;
    return from <= tMs && tMs < to;
  });
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Fixed assessment footer for the diligence memo (IC-ready summary block).
const MEMO_CONFIDENCE = 93;
const MEMO_SOURCES: Array<{ host: string; date: string }> = [
  { host: 'wsj.com', date: '2026-03-31' },
  { host: 'cnbc.com', date: '2026-03-31' },
  { host: 'linkedin.com', date: '2026-03-11' },
  { host: 'glassdoor.com', date: '2026-04-15' },
];

type Tab = 'overview' | 'memo';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'overview', label: 'Timeline & Risk', hint: 'Replay, graph, delta & analogs' },
  { id: 'memo', label: 'Ask & Memo', hint: 'Cited Q&A and the diligence memo' },
];

export function Dashboard({ dossier, demoMode }: { dossier: Dossier; demoMode?: boolean }) {
  const fromMs = Date.parse(dossier.window.from);
  const toMs = Date.parse(dossier.window.to);

  const [cursor, setCursor] = useState(toMs);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [demoToast, setDemoToast] = useState(false);

  useEffect(() => {
    if (!demoMode) return;
    const handler = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const cls = a.className ?? '';
      if (cls.includes('delta-cite') || cls.includes('qa-cite') || cls.includes('sc-chip') ||
          cls.includes('tl-link') || cls.includes('memo-cite') || cls.includes('ref-link') ||
          a.closest('.cite') || a.closest('.sources-panel')) {
        e.preventDefault();
        setDemoToast(true);
        setTimeout(() => setDemoToast(false), 3500);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [demoMode]);

  // ── animated replay ──────────────────────────────────
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      setCursor((c) => {
        const next = c + 2 * DAY;
        if (next >= toMs) {
          setPlaying(false);
          return toMs;
        }
        return next;
      });
      raf.current = window.setTimeout(tick, 60) as unknown as number;
    };
    raf.current = window.setTimeout(tick, 60) as unknown as number;
    return () => {
      if (raf.current) clearTimeout(raf.current);
    };
  }, [playing, toMs]);

  function play() {
    if (cursor >= toMs) setCursor(fromMs);
    setPlaying(true);
  }

  // ── name lookup ──────────────────────────────────────
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of dossier.entities) m.set(e.id, e.name);
    return m;
  }, [dossier.entities]);
  const name = (id: string) => nameById.get(id) ?? id;

  // ── graph model: real entities + synthesised company-signal nodes ──
  const graph = useMemo(() => {
    const cx = 350;
    const cy = 210;
    const r = 165;
    const labelGap = 24;
    const company = dossier.entities.find((e) => e.id === dossier.companyId);
    const realSats = dossier.entities.filter((e) => e.id !== dossier.companyId);
    const selfKinds = Array.from(
      new Set(
        dossier.relations.filter((x) => x.fromEntityId === x.toEntityId).map((x) => x.kind),
      ),
    );

    type Sat = {
      id: string;
      isSignal: boolean;
      label: string;
      sub?: string;
      color: string;
      icon: string;
      evCat?: string;
    };
    const sats: Sat[] = [
      ...realSats.map((e) => ({
        id: e.id,
        isSignal: false,
        label: e.name,
        sub: e.type === 'person' ? (e.attributes?.role as string | undefined) : e.type,
        color: TYPE_COLOR[e.type] ?? TYPE_COLOR.default,
        icon: TYPE_ICON[e.type] ?? TYPE_ICON.default,
        evCat: TYPE_EVENT_CAT[e.type],
      })),
      ...selfKinds.map((k) => ({
        id: `sig:${k}`,
        isSignal: true,
        label: signalLabel(k),
        sub: 'company signal',
        color: kindColor(k),
        icon: signalIcon(k),
        evCat: SIGNAL_EVENT_CAT[k],
      })),
    ];

    const pos = new Map<string, { x: number; y: number }>();
    pos.set(dossier.companyId, { x: cx, y: cy });

    // Lay out every node (hidden ones stay in place, just dimmed in render).
    const nodes = sats.map((s, i) => {
      const a = (i / sats.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      pos.set(s.id, { x, y });
      const cos = Math.cos(a);
      const anchor: 'start' | 'end' | 'middle' = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
      return {
        ...s,
        x,
        y,
        lx: x + cos * labelGap,
        ly: y + Math.sin(a) * labelGap,
        anchor,
      };
    });

    const edges = dossier.relations.map((rel) => {
      const toId = rel.fromEntityId === rel.toEntityId ? `sig:${rel.kind}` : rel.toEntityId;
      return {
        id: rel.id,
        kind: rel.kind,
        fromId: rel.fromEntityId,
        toId,
        from: pos.get(rel.fromEntityId),
        to: pos.get(toId),
      };
    });

    return {
      companyName: company?.name ?? dossier.target,
      nodes,
      edges,
      center: { x: cx, y: cy },
    };
  }, [dossier]);

  function toggleNode(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Event categories implied by currently-hidden nodes — dims matching replay dots.
  const hiddenEventCats = useMemo(() => {
    const cats = new Set<string>();
    for (const n of graph.nodes) if (hidden.has(n.id) && n.evCat) cats.add(n.evCat);
    return cats;
  }, [graph.nodes, hidden]);

  // node id → its first citation source (host + url + evidence), for hover cards.
  const nodeSource = useMemo(() => {
    const m = new Map<string, { host: string; url: string; text: string }>();
    for (const r of dossier.relations) {
      const s = r.sources[0];
      if (!s) continue;
      const text = r.evidence || s.excerpt || '';
      const ids = [
        r.fromEntityId,
        r.fromEntityId === r.toEntityId ? `sig:${r.kind}` : r.toEntityId,
      ];
      for (const id of ids)
        if (!m.has(id)) m.set(id, { host: hostOf(s.url), url: s.url, text });
    }
    return m;
  }, [dossier.relations]);

  // ── anchored, clickable hover card (graph nodes, sidebar rows, replay markers) ──
  const [tip, setTip] = useState<{
    top: number;
    left: number;
    text: string;
    host?: string;
    url?: string;
  } | null>(null);
  const tipTimer = useRef<number | null>(null);
  function cancelClose() {
    if (tipTimer.current) {
      clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
  }
  function openTip(
    rect: DOMRect,
    text: string,
    src?: { host: string; url: string },
  ) {
    cancelClose();
    setTip({
      top: rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 300),
      text,
      host: src?.host,
      url: src?.url,
    });
  }
  function scheduleClose() {
    cancelClose();
    tipTimer.current = window.setTimeout(() => setTip(null), 220);
  }

  // measure the knowledge-graph panel so the signals panel can match its height.
  const graphRef = useRef<HTMLDivElement>(null);
  const [graphH, setGraphH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = graphRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setGraphH(el.offsetHeight));
    ro.observe(el);
    setGraphH(el.offsetHeight);
    return () => ro.disconnect();
  }, [tab]);

  // ── derived state at cursor ──────────────────────────
  const active = activeAt(dossier.relations, cursor);
  const activeRelIds = new Set(active.map((r) => r.id));
  const activeNodeIds = new Set<string>();
  for (const r of active) {
    activeNodeIds.add(r.fromEntityId);
    activeNodeIds.add(r.fromEntityId === r.toEntityId ? `sig:${r.kind}` : r.toEntityId);
  }

  const since90 = cursor - 90 * DAY;
  const departures90 = dossier.relations.filter(
    (r) => r.kind === 'departed' && Date.parse(r.validFrom) > since90 && Date.parse(r.validFrom) <= cursor,
  ).length;

  const flags = countFlags(active, departures90);

  // ── diligence analytics (delta / memo / Q&A) ─────────
  const LOOKBACK = 90;
  // Hiding an entity/signal removes it from the memo: build a dossier that drops
  // hidden entities' relations (and category-matched events) so every memo
  // computation below reflects only what is currently in scope.
  const visibleDossier = useMemo<Dossier>(() => {
    if (hidden.size === 0) return dossier;
    const hiddenSigKinds = new Set<string>();
    for (const id of hidden) if (id.startsWith('sig:')) hiddenSigKinds.add(id.slice(4));
    const relations = dossier.relations.filter((r) => {
      if (hidden.has(r.fromEntityId) || hidden.has(r.toEntityId)) return false;
      if (r.fromEntityId === r.toEntityId && hiddenSigKinds.has(r.kind)) return false;
      return true;
    });
    const entities = dossier.entities.filter((e) => !hidden.has(e.id));
    // Events aren't entity-linked, so only drop them when a company-level signal
    // diamond is hidden (those are inherently category-wide); entity hides remove
    // just that entity's relations, not unrelated events.
    const hiddenSignalCats = new Set<string>();
    for (const k of hiddenSigKinds) {
      const cat = SIGNAL_EVENT_CAT[k as RelationKind];
      if (cat) hiddenSignalCats.add(cat);
    }
    const events = hiddenSignalCats.size
      ? dossier.events.filter((ev) => !hiddenSignalCats.has(ev.category))
      : dossier.events;
    return { ...dossier, entities, relations, events };
  }, [dossier, hidden]);

  // Overview delta panel stays on the full dossier (overview dims in place);
  // the memo + Q&A run on the visible (in-scope) dossier so hidden = excluded.
  const delta = useMemo<DeltaRow[]>(
    () => computeDelta(dossier, cursor - LOOKBACK * DAY, cursor),
    [dossier, cursor],
  );
  const memoDelta = useMemo<DeltaRow[]>(
    () => computeDelta(visibleDossier, cursor - LOOKBACK * DAY, cursor),
    [visibleDossier, cursor],
  );
  const memo = useMemo<MemoModel>(
    () => buildMemo(visibleDossier, cursor, LOOKBACK),
    [visibleDossier, cursor],
  );
  const qa = useMemo<QA[]>(() => answerQuestions(visibleDossier), [visibleDossier]);

  // Preliminary disposition for the memo's IC callout — reflects in-scope risk only.
  const memoFlags = memo.critical + memo.high;
  const disposition =
    memo.critical > 0
      ? { verdict: 'Proceed with conditions', tone: 'warn' as const }
      : memo.high > 0
        ? { verdict: 'Monitor — elevated risk', tone: 'warn' as const }
        : { verdict: 'Proceed', tone: 'ok' as const };

  // Position a memo-timeline marker (ISO date) along the lookback window [0,100].
  const memoFromMs = cursor - LOOKBACK * DAY;
  const memoPct = (dateStr: string) =>
    Math.max(0, Math.min(100, ((Date.parse(dateStr) - memoFromMs) / (cursor - memoFromMs)) * 100));

  // Numbered plot markers; fan same-date events apart so the numbers don't stack.
  const memoMarks = useMemo(() => {
    const total = new Map<string, number>();
    for (const t of memo.timeline) total.set(t.date, (total.get(t.date) ?? 0) + 1);
    const seen = new Map<string, number>();
    return memo.timeline.map((t, i) => {
      const n = total.get(t.date)!;
      const k = seen.get(t.date) ?? 0;
      seen.set(t.date, k + 1);
      return {
        n: i + 1,
        label: t.label,
        date: t.date,
        leftPct: memoPct(t.date),
        offsetPx: (k - (n - 1) / 2) * 16,
        dir: i % 2 ? 'down' : 'up',
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memo.timeline, memoFromMs, cursor]);
  const [openQA, setOpenQA] = useState<string | null>(null);
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);

  // ── Ask: user-typed questions + answers pinned into the summary ──
  const [askInput, setAskInput] = useState('');
  const [asked, setAsked] = useState<QA[]>([]);
  const [pinned, setPinned] = useState<QA[]>([]);
  function submitAsk() {
    const text = askInput.trim();
    if (!text) return;
    setAsked((prev) => [answerAdHoc(visibleDossier, text), ...prev]);
    setAskInput('');
  }
  function pinToSummary(item: QA) {
    setPinned((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
  }
  function unpin(id: string) {
    setPinned((prev) => prev.filter((p) => p.id !== id));
  }

  // Smooth-scroll to a section within the overview and briefly highlight it.
  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 1300);
  }

  // ── departure sparkline (weekly buckets, with names) ──
  const spark = useMemo(() => {
    const weeks = Math.ceil((toMs - fromMs) / (7 * DAY));
    const buckets: Array<{ count: number; names: string[] }> = Array.from(
      { length: weeks },
      () => ({ count: 0, names: [] }),
    );
    for (const r of dossier.relations) {
      if (r.kind !== 'departed') continue;
      const ts = Date.parse(r.validFrom);
      if (ts < fromMs || ts > toMs) continue;
      const b = buckets[Math.min(weeks - 1, Math.floor((ts - fromMs) / (7 * DAY)))];
      b.count += 1;
      b.names.push(nameById.get(r.fromEntityId) ?? r.fromEntityId);
    }
    return buckets;
  }, [dossier.relations, fromMs, toMs, nameById]);
  const sparkMax = Math.max(1, ...spark.map((b) => b.count));

  const pct = (ms: number) => ((ms - fromMs) / (toMs - fromMs)) * 100;

  return (
    <div>
      {demoToast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-2, #1e2330)', border: '1px solid var(--border, #2a3040)',
          color: 'var(--text)', padding: '0.65rem 1.25rem', borderRadius: '8px',
          fontSize: '0.82rem', zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          Demo mode — source links are illustrative. Live mode scrapes real URLs via Bright Data.
        </div>
      )}
      <div className="dash-head">
        <h1>{titleCase(dossier.target)}</h1>
        <span className="domain">{dossier.target}</span>
      </div>
      <div className="dash-sub">
        Temporal knowledge graph · {dossier.entities.length} entities ·{' '}
        {dossier.relations.length} timestamped relations · {dossier.events.length} events ·
        180-day window
      </div>

      {/* ── tab nav ── */}
      <nav className="tabnav no-print">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tabnav-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tabnav-label">{t.label}</span>
            <span className="tabnav-hint">{t.hint}</span>
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
      {/* ── stats (click to jump to the relevant section) ── */}
      <div className="stats">
        <button className="stat" onClick={() => jumpTo('sec-graph')}>
          <div className="num">{dossier.entities.length}</div>
          <div className="lbl">Entities tracked</div>
          <div className="stat-go">View graph →</div>
        </button>
        <button className="stat" onClick={() => jumpTo('sec-signals')}>
          <div className="num">{active.length}</div>
          <div className="lbl">Signals active @ cursor</div>
          <div className="stat-go">View signals →</div>
        </button>
        <button
          className={`stat ${departures90 >= 2 ? 'danger' : ''}`}
          onClick={() => jumpTo('sec-trajectory')}
        >
          <div className="num">{departures90}</div>
          <div className="lbl">Exec departures · trailing 90d</div>
          <div className="stat-go">View trajectory →</div>
        </button>
        <button
          className={`stat ${flags > 0 ? 'warn' : ''}`}
          onClick={() => jumpTo('sec-delta')}
        >
          <div className="num">{flags}</div>
          <div className="lbl">Red flags raised</div>
          <div className="stat-go">View delta →</div>
        </button>
      </div>

      {/* ── replay + knowledge graph (left) + active signals (right) ── */}
      <div className="overview-cols">
      <div className="panel graphbox" id="sec-graph" ref={graphRef}>
        <div className="graphbox-head">
          <h2>Knowledge graph + time replay</h2>
        </div>

        {/* replay: date + play (left), slider + icon timeline (right, same icons as graph) */}
        <div className="replay-controls">
          <div className="replay-left">
            <span className="slider-cursor">{fmtDate(cursor)}</span>
            <button
              className={`replay-play${playing ? ' playing' : ''}`}
              onClick={() => (playing ? setPlaying(false) : play())}
            >
              <span className="rp-glyph">{playing ? '❚❚' : '▶'}</span>
              {playing ? 'Pause' : cursor >= toMs ? 'Replay' : 'Play'}
            </button>
          </div>
          <div className="replay-track">
            <input
              type="range"
              className="replay-slider"
              min={fromMs}
              max={toMs}
              step={DAY}
              value={cursor}
              style={{ ['--fill' as string]: `${pct(cursor)}%` }}
              onChange={(e) => {
                setPlaying(false);
                setCursor(Number(e.target.value));
              }}
            />
            <div className="timeline timeline-icons">
              {dossier.events.map((ev) => {
                const ms = Date.parse(ev.occurredAt);
                const dim = hiddenEventCats.has(ev.category);
                const src = ev.sources?.[0];
                return (
                  <button
                    key={ev.id}
                    className="tl-event"
                    onMouseEnter={(e) =>
                      openTip(
                        e.currentTarget.getBoundingClientRect(),
                        `${ev.title} · ${fmtDate(ms)}`,
                        src ? { host: hostOf(src.url), url: src.url } : undefined,
                      )
                    }
                    onMouseLeave={scheduleClose}
                    onClick={() => {
                      setPlaying(false);
                      setCursor(ms);
                    }}
                    style={{
                      left: `${pct(ms)}%`,
                      borderColor: EVENT_COLOR[ev.category] ?? 'var(--text-dim)',
                      opacity: dim ? 0.22 : 1,
                    }}
                  >
                    <span className="tl-ic">{eventIcon(ev.category)}</span>
                  </button>
                );
              })}
              <div className="tl-cursor" style={{ left: `${pct(cursor)}%` }} />
            </div>
            <div className="slider-ends">
              <span>{fmtDate(fromMs)}</span>
              <span>{fmtDate(toMs)}</span>
            </div>
          </div>
        </div>

        {/* body: source list (left) + graph */}
        <div className="graphbox-body">
          <aside className="entity-list">
            <div className="el-head">
              Sources<span className="el-hint">click to hide / show</span>
            </div>
            {graph.nodes.map((n) => {
              const isHidden = hidden.has(n.id);
              return (
                <button
                  key={n.id}
                  className={`el-row${isHidden ? ' hidden' : ''}`}
                  onClick={() => toggleNode(n.id)}
                  onMouseEnter={(e) => {
                    const s = nodeSource.get(n.id);
                    openTip(e.currentTarget.getBoundingClientRect(), s?.text ?? n.label, s);
                  }}
                  onMouseLeave={scheduleClose}
                >
                  <span className="el-ic" style={{ borderColor: n.color }}>
                    {n.icon}
                  </span>
                  <span className="el-name">{n.label}</span>
                  <span className="el-x">{isHidden ? '＋' : '×'}</span>
                </button>
              );
            })}
          </aside>

          <svg className="graph-svg" viewBox="0 0 700 420">
            {graph.edges.map((e) => {
              if (!e.from || !e.to) return null;
              const edgeHidden = hidden.has(e.fromId) || hidden.has(e.toId);
              const on = activeRelIds.has(e.id) && !edgeHidden;
              return (
                <line
                  key={e.id}
                  className="edge-line"
                  x1={e.from.x}
                  y1={e.from.y}
                  x2={e.to.x}
                  y2={e.to.y}
                  stroke={on ? kindColor(e.kind) : 'var(--border)'}
                  strokeOpacity={edgeHidden ? 0.06 : on ? 0.9 : 0.18}
                  strokeWidth={on ? 2 : 1}
                />
              );
            })}

            {/* company (centre) */}
            <g>
              <circle
                cx={graph.center.x}
                cy={graph.center.y}
                r={17}
                fill="var(--accent-dim)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
              <text
                className="node-icon"
                x={graph.center.x}
                y={graph.center.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: 16 }}
              >
                🏢
              </text>
              <text
                className="node-label"
                x={graph.center.x}
                y={graph.center.y + 33}
                textAnchor="middle"
                style={{ fontWeight: 600 }}
              >
                {graph.companyName}
              </text>
            </g>

            {/* satellites: entities (circles) + company signals (diamonds) */}
            {graph.nodes.map((n) => {
              const isHidden = hidden.has(n.id);
              const on = activeNodeIds.has(n.id);
              const op = isHidden ? 0.16 : on ? 1 : 0.32;
              return (
                <g
                  key={n.id}
                  className="graph-node"
                  opacity={op}
                  onClick={() => toggleNode(n.id)}
                  onMouseEnter={(e) => {
                    const s = nodeSource.get(n.id);
                    openTip(
                      (e.currentTarget as SVGGElement).getBoundingClientRect(),
                      s?.text ?? n.label,
                      s,
                    );
                  }}
                  onMouseLeave={scheduleClose}
                >
                  {n.isSignal ? (
                    <rect
                      x={n.x - 11}
                      y={n.y - 11}
                      width={22}
                      height={22}
                      rx={3}
                      transform={`rotate(45 ${n.x} ${n.y})`}
                      fill="var(--bg-elev-2)"
                      stroke={n.color}
                      strokeWidth={2}
                      strokeDasharray={isHidden ? '3 3' : undefined}
                    />
                  ) : (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={13}
                      fill="var(--bg-elev-2)"
                      stroke={n.color}
                      strokeWidth={2}
                      strokeDasharray={isHidden ? '3 3' : undefined}
                    />
                  )}
                  <text
                    className="node-icon"
                    x={n.x}
                    y={n.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {n.icon}
                  </text>
                  <text className="node-label" x={n.lx} y={n.ly} textAnchor={n.anchor} dominantBaseline="middle">
                    {n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label}
                  </text>
                  {n.sub && (
                    <text
                      className="node-sub"
                      x={n.lx}
                      y={n.ly + 12}
                      textAnchor={n.anchor}
                      dominantBaseline="middle"
                    >
                      {n.sub}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="legend">
          <span className="lg-note">Shape = node type:</span>
          <span className="lg-item">
            <i className="ring" style={{ borderColor: 'var(--text-dim)' }} />circle = entity
          </span>
          <span className="lg-item">
            <i className="diamond" />diamond = company signal
          </span>
          <span className="lg-sep" />
          <span className="lg-note">Color = risk direction:</span>
          <span className="lg-item">
            <i style={{ background: 'var(--danger)' }} />risk
          </span>
          <span className="lg-item">
            <i style={{ background: 'var(--ok)' }} />positive
          </span>
          <span className="lg-item">
            <i style={{ background: 'var(--accent)' }} />neutral
          </span>
          {hidden.size > 0 && (
            <button className="ghb-restore" onClick={() => setHidden(new Set())}>
              Restore all ({hidden.size} hidden)
            </button>
          )}
        </div>
      </div>

      {/* ── active signals / citations (right column) ── */}
      <div
        className="panel signals-panel"
        id="sec-signals"
        style={graphH ? { height: graphH } : undefined}
      >
        <h2>Active signals @ {fmtDate(cursor)} · cited</h2>
        <div className="signals-scroll">
        {active.length === 0 && <div className="empty">No signals active at this date.</div>}
        {[...active]
          .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom))
          .map((r) => {
            const fresh = cursor - Date.parse(r.validFrom) <= 14 * DAY;
            const s = r.sources[0];
            return (
              <div key={r.id} className={`rel${fresh ? ' fresh' : ''}`}>
                <div className="kind">
                  {name(r.fromEntityId)} <b>{r.kind.replace(/_/g, ' ')}</b>{' '}
                  {r.fromEntityId !== r.toEntityId ? name(r.toEntityId) : ''}
                </div>
                <div className="evidence">“{r.evidence}”</div>
                <div className="cite">
                  {fmtDate(Date.parse(r.validFrom))} ·{' '}
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {hostOf(s.url)}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>{/* /overview-cols */}

      {/* ── departure trajectory ── */}
      <div className="panel" id="sec-trajectory" style={{ marginTop: 20 }}>
        <h2>Executive departures over time · weekly</h2>
        <p className="chart-help">
          Each bar is one week of the 180-day window. Taller red bars = more executives
          left that week. Bars past the slider position are dimmed. Hover a bar for who left.
        </p>
        <div className="traj-readout">
          {hoverWeek != null && spark[hoverWeek] ? (
            <>
              <b>Week of {fmtDate(fromMs + hoverWeek * 7 * DAY)}</b> ·{' '}
              {spark[hoverWeek].count === 0
                ? 'no departures'
                : `${spark[hoverWeek].count} departure${spark[hoverWeek].count > 1 ? 's' : ''}: ${spark[hoverWeek].names.join(', ')}`}
            </>
          ) : (
            <span className="chart-help">Hover a bar to see the week and names.</span>
          )}
        </div>
        <div className="spark">
          {spark.map((b, i) => {
            const weekStart = fromMs + i * 7 * DAY;
            const beforeCursor = weekStart <= cursor;
            return (
              <div
                key={i}
                className={`bar${b.count > 0 && beforeCursor ? ' hot' : ''}${hoverWeek === i ? ' hover' : ''}`}
                style={{
                  height: `${Math.max(b.count > 0 ? 8 : 0, (b.count / sparkMax) * 100)}%`,
                  opacity: beforeCursor ? 1 : 0.3,
                }}
                onMouseEnter={() => setHoverWeek(i)}
                onMouseLeave={() => setHoverWeek((w) => (w === i ? null : w))}
                title={`Week of ${fmtDate(weekStart)}: ${b.count} departure(s)${b.names.length ? ' — ' + b.names.join(', ') : ''}`}
              />
            );
          })}
        </div>
        <div className="spark-axis">
          {monthTicks(fromMs, toMs).map((t) => (
            <span key={t.ms} style={{ left: `${pct(t.ms)}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Δ delta report ── */}
      <div className="panel" style={{ marginTop: 20 }} id="sec-delta">
        <h2>
          Δ Delta report · {fmtDate(cursor - LOOKBACK * DAY)} → {fmtDate(cursor)}
        </h2>
        {delta.length === 0 && (
          <div className="empty">No material changes in the trailing {LOOKBACK} days.</div>
        )}
        {delta.map((row) => (
          <div key={row.category} className="delta-row">
            <div className="delta-head">
              <span className="delta-sev">{SEVERITY_DOT[row.severity]}</span>
              <span className="delta-cat">{row.label}</span>
              <span className="delta-badge" style={{ color: SEVERITY_COLOR[row.severity] }}>
                {row.delta}
              </span>
              <span className="delta-rank" style={{ color: SEVERITY_COLOR[row.severity] }}>
                {row.severity}
              </span>
            </div>
            <ul className="delta-items">
              {row.items.map((it, i) => (
                <li key={i}>
                  {it.text}
                  {it.url && (
                    <>
                      {' '}
                      <a className="delta-cite" href={it.url} target="_blank" rel="noreferrer">
                        {it.host} · {it.date}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ── analog (beta) ── */}
      <div className="panel analog-panel" style={{ marginTop: 20 }}>
        <h2>
          Analog pattern search
          <span className="beta-badge" title="Experimental — may not ship">beta</span>
        </h2>
        <div className="analog-q">
          Companies whose trajectory resembles {titleCase(dossier.target)}&apos;s
        </div>
        {memo.analog.map((m) => (
          <div key={m.name} className="analog-row">
            <div className="analog-meta">
              <span className="analog-name">{m.name}</span>
              <span className="analog-sim">{m.similarity.toFixed(2)}</span>
            </div>
            <div className="analog-bar">
              <div className="analog-fill" style={{ width: `${m.similarity * 100}%` }} />
            </div>
            <div className="analog-note">{m.note}</div>
          </div>
        ))}
        <div className="analog-foot">
          Beta feature — illustrative comparables only, may not ship. Live ranking would require the
          multi-company signal index.
        </div>
      </div>
        </>
      )}

      {tab === 'memo' && (
        <div className="memo-cols">
      {/* ── Ask Vantage ── */}
      <div className="panel ask-panel">
        <h2>Ask Vantage · cited Q&amp;A</h2>
        <p className="chart-help" style={{ marginTop: 0 }}>
          Plain-language answers, every claim linked to its source. Ask your own question, then
          pin the answer into the memo summary below.
        </p>

        <form
          className="ask-form no-print"
          onSubmit={(e) => {
            e.preventDefault();
            submitAsk();
          }}
        >
          <input
            className="ask-input"
            placeholder="Ask about management, legal exposure, sentiment…"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
          />
          <button type="submit" className="ask-btn" disabled={!askInput.trim()}>
            Ask
          </button>
        </form>

        {/* user-asked answers (newest first) */}
        {asked.map((q) => {
          const isPinned = pinned.some((p) => p.id === q.id);
          return (
            <div key={q.id} className="qa open ask-answer">
              <div className="qa-q-static">{q.question}</div>
              <div className="qa-a">
                <p>{q.answer}</p>
                <div className="qa-cites">
                  {q.citations.map((c, i) => (
                    <a key={i} href={c.url} target="_blank" rel="noreferrer" className="qa-cite">
                      [{i + 1}] {c.host} · {c.date}
                    </a>
                  ))}
                </div>
                <button className="pin-btn" onClick={() => pinToSummary(q)} disabled={isPinned}>
                  {isPinned ? '✓ in summary' : '➕ Add to summary'}
                </button>
              </div>
            </div>
          );
        })}

        {/* canned Q&A */}
        {qa.map((q) => {
          const isPinned = pinned.some((p) => p.id === q.id);
          return (
            <div key={q.id} className={`qa${openQA === q.id ? ' open' : ''}`}>
              <button className="qa-q" onClick={() => setOpenQA(openQA === q.id ? null : q.id)}>
                <span className="qa-caret">{openQA === q.id ? '▾' : '▸'}</span> {q.question}
              </button>
              {openQA === q.id && (
                <div className="qa-a">
                  <p>{q.answer}</p>
                  <div className="qa-cites">
                    {q.citations.map((c, i) => (
                      <a key={i} href={c.url} target="_blank" rel="noreferrer" className="qa-cite">
                        [{i + 1}] {c.host} · {c.date}
                      </a>
                    ))}
                  </div>
                  <button className="pin-btn" onClick={() => pinToSummary(q)} disabled={isPinned}>
                    {isPinned ? '✓ in summary' : '➕ Add to summary'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* sources in scope — same hide/show selection as the graph; hidden = excluded from the memo */}
        <div className="scope-control">
          <div className="scope-head">
            <span className="scope-title">Sources in scope</span>
            {hidden.size > 0 && (
              <button className="scope-restore no-print" onClick={() => setHidden(new Set())}>
                Restore all ({hidden.size})
              </button>
            )}
          </div>
          <p className="scope-hint">
            {hidden.size > 0
              ? `${hidden.size} hidden — excluded from the memo on the right.`
              : 'Click to hide a source; it is dropped from the memo on the right.'}
          </p>
          <div className="scope-list">
            {graph.nodes.map((n) => {
              const isHidden = hidden.has(n.id);
              return (
                <button
                  key={n.id}
                  className={`el-row${isHidden ? ' hidden' : ''}`}
                  onClick={() => toggleNode(n.id)}
                >
                  <span className="el-ic" style={{ borderColor: n.color }}>
                    {n.icon}
                  </span>
                  <span className="el-name">{n.label}</span>
                  <span className="el-x">{isHidden ? '＋' : '×'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── memo ── */}
      <div className="panel memo" id="vantage-memo">
        {/* letterhead */}
        <div className="memo-letterhead">
          <div className="memo-firm">
            <span className="memo-firm-mark">▰</span>
            <span className="memo-firm-name">VANTAGE</span>
            <span className="memo-firm-sub">Diligence &amp; Risk Advisory</span>
          </div>
          <button className="playbtn no-print" onClick={() => window.print()}>
            ⤓ Export PDF
          </button>
        </div>
        <div className="memo-classification">
          Private &amp; Confidential — Prepared for Internal Investment Committee Use Only
        </div>

        {/* title + metadata block */}
        <div className="memo-title-block">
          <div className="memo-doctype">Investment Diligence Memorandum</div>
          <h2 className="memo-title">{titleCase(dossier.target)}</h2>
          <dl className="memo-meta">
            <div className="memo-meta-row">
              <dt>Re</dt>
              <dd>Temporal risk assessment — {memo.lookbackDays}-day lookback</dd>
            </div>
            <div className="memo-meta-row">
              <dt>As of</dt>
              <dd>{memo.asOf}</dd>
            </div>
            <div className="memo-meta-row">
              <dt>Prepared by</dt>
              <dd>Vantage Diligence Engine · Sentinels</dd>
            </div>
            <div className="memo-meta-row">
              <dt>Data sourcing</dt>
              <dd>Bright Data — live web collection</dd>
            </div>
          </dl>
        </div>

        {/* preliminary disposition callout */}
        <div className={`memo-disposition ${disposition.tone}`}>
          <div className="md-label">Preliminary disposition</div>
          <div className="md-value">{disposition.verdict}</div>
          <div className="md-note">
            {memoFlags > 0
              ? `${memoFlags} elevated signal${memoFlags > 1 ? 's' : ''} in scope; confirmatory diligence on leadership retention and litigation exposure recommended before final IC.`
              : 'No material red flags in scope for the trailing window on the signals tracked.'}
          </div>
        </div>

        <div className="memo-section">
          <div className="memo-label">1 · Executive summary</div>
          <p className="memo-text">{memo.summary}</p>

          {pinned.length > 0 && (
            <div className="pinned-list">
              {pinned.map((p) => (
                <div key={p.id} className="pinned">
                  <button
                    className="pinned-x no-print"
                    onClick={() => unpin(p.id)}
                    title="Remove from summary"
                  >
                    ×
                  </button>
                  <div className="pinned-q">{p.question}</div>
                  <div className="pinned-a">{p.answer}</div>
                  <div className="qa-cites">
                    {p.citations.map((c, i) => (
                      <a key={i} href={c.url} target="_blank" rel="noreferrer" className="qa-cite">
                        [{i + 1}] {c.host} · {c.date}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="memo-section">
          <div className="memo-label">
            2 · Material changes · Δ delta {fmtDate(cursor - LOOKBACK * DAY)} → {fmtDate(cursor)}
          </div>
          {memoDelta.length === 0 ? (
            <div className="empty">No material changes in scope for the trailing {LOOKBACK} days.</div>
          ) : (
            <table className="memo-delta">
              <tbody>
                {memoDelta.map((row) => (
                  <tr key={row.category}>
                    <td className="memo-delta-cat">
                      <span className="mdx-dot">{SEVERITY_DOT[row.severity]}</span> {row.label}
                    </td>
                    <td className="memo-delta-change" style={{ color: SEVERITY_COLOR[row.severity] }}>
                      {row.delta}
                    </td>
                    <td className="memo-delta-sev" style={{ color: SEVERITY_COLOR[row.severity] }}>
                      {row.severity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="memo-section">
          <div className="memo-label">3 · Timeline of events</div>
          {memo.timeline.length === 0 ? (
            <div className="empty">No timestamped events in window.</div>
          ) : (
            <>
              <div className="memo-tl-plot">
                <div className="mtp-axis" />
                {memoMarks.map((m) => (
                  <div
                    key={m.n}
                    className={`mtp-mark ${m.dir}`}
                    style={{ left: `${m.leftPct}%`, marginLeft: m.offsetPx }}
                    title={`[${m.n}] ${m.label} · ${m.date}`}
                  >
                    <span className="mtp-line" />
                    <span className="mtp-dot" />
                    <span className="mtp-num">{m.n}</span>
                  </div>
                ))}
                <div className="mtp-ends">
                  <span>{fmtDate(cursor - LOOKBACK * DAY)}</span>
                  <span>{fmtDate(cursor)}</span>
                </div>
              </div>
              <table className="memo-tl">
                <tbody>
                  {memo.timeline.map((t, i) => (
                    <tr key={i}>
                      <td className="memo-tl-n">{i + 1}</td>
                      <td className="memo-tl-date">{t.date}</td>
                      <td className="memo-tl-label">
                        {t.label}
                        {t.url && (
                          <a
                            className="ref-link"
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            title={t.host}
                          >
                            ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="memo-section">
          <div className="memo-label">4 · Risk narrative</div>
          {memo.narrative.map((n, i) => (
            <p key={i} className="memo-text">
              {n.text}
              {n.citations.map((c, j) => (
                <a
                  key={j}
                  className="ref-link"
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${c.host} · ${c.date}`}
                >
                  [{j + 1}]
                </a>
              ))}
            </p>
          ))}
        </div>

        <div className="memo-section">
          <div className="memo-label">5 · Comparable pattern analysis</div>
          <p className="memo-text">
            This {memo.lookbackDays}-day pattern most resembles{' '}
            {memo.analog
              .slice(0, 2)
              .map((m) => `${m.name} (${m.similarity.toFixed(2)})`)
              .join(' and ')}
            .
          </p>
        </div>

        {/* assessment footer — overall confidence + sources */}
        <div className="memo-assessment">
          <div className="ma-conf">
            <span className="ma-conf-num">{MEMO_CONFIDENCE}%</span>
            <span className="ma-conf-label">confidence</span>
          </div>
          <div className="ma-sources">
            <div className="ma-sources-label">Sources</div>
            <ol className="ma-source-list">
              {MEMO_SOURCES.map((s, i) => (
                <li key={s.host}>
                  <span className="ma-src-n">[{i + 1}]</span>
                  <a href={`https://${s.host}`} target="_blank" rel="noreferrer">
                    {s.host}
                  </a>
                  <span className="ma-src-date"> · {s.date}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
        </div>
      )}

      {tip && (
        <div
          className="hover-tip"
          style={{ left: tip.left, top: tip.top }}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={() => setTip(null)}
        >
          {tip.text && <div className="hover-tip-text">“{tip.text}”</div>}
          {tip.url ? (
            <a
              className="hover-tip-link"
              href={tip.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="hover-tip-dot" /> {tip.host} ↗
            </a>
          ) : (
            <div className="hover-tip-src muted">No linked source</div>
          )}
        </div>
      )}
    </div>
  );
}

function countFlags(active: TemporalRelation[], departures90: number): number {
  let n = 0;
  if (departures90 >= 2) n++;
  if (active.some((r) => r.kind === 'laid_off')) n++;
  if (active.some((r) => r.kind === 'litigated_with')) n++;
  if (active.some((r) => r.kind === 'reviewed_negatively')) n++;
  return n;
}

function monthTicks(fromMs: number, toMs: number): Array<{ ms: number; label: string }> {
  const ticks: Array<{ ms: number; label: string }> = [];
  const d = new Date(fromMs);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= toMs) {
    ticks.push({
      ms: d.getTime(),
      label: d.toLocaleDateString('en-US', { month: 'short' }),
    });
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function titleCase(domain: string): string {
  const base = domain.replace(/\.(com|io|ai|co|net)$/i, '').replace(/[._-]/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}
