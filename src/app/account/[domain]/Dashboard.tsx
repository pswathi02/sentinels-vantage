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

type Tab = 'overview' | 'memo';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'overview', label: 'Timeline & Risk', hint: 'Replay, graph, delta & analogs' },
  { id: 'memo', label: 'Ask & Memo', hint: 'Cited Q&A and the diligence memo' },
];

export function Dashboard({ dossier }: { dossier: Dossier }) {
  const fromMs = Date.parse(dossier.window.from);
  const toMs = Date.parse(dossier.window.to);

  const [cursor, setCursor] = useState(toMs);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

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
  const delta = useMemo<DeltaRow[]>(
    () => computeDelta(dossier, cursor - LOOKBACK * DAY, cursor),
    [dossier, cursor],
  );
  const memo = useMemo<MemoModel>(() => buildMemo(dossier, cursor, LOOKBACK), [dossier, cursor]);
  const qa = useMemo<QA[]>(() => answerQuestions(dossier), [dossier]);
  const [openQA, setOpenQA] = useState<string | null>(null);
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);

  // ── Ask: user-typed questions + answers pinned into the summary ──
  const [askInput, setAskInput] = useState('');
  const [asked, setAsked] = useState<QA[]>([]);
  const [pinned, setPinned] = useState<QA[]>([]);
  function submitAsk() {
    const text = askInput.trim();
    if (!text) return;
    setAsked((prev) => [answerAdHoc(dossier, text), ...prev]);
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
      <div className="panel graphbox" id="sec-graph">
        <div className="graphbox-head">
          <h2>Knowledge graph + time replay</h2>
          <div className="slider-meta">
            <button
              className={`replay-play${playing ? ' playing' : ''}`}
              onClick={() => (playing ? setPlaying(false) : play())}
            >
              <span className="rp-glyph">{playing ? '❚❚' : '▶'}</span>
              {playing ? 'Pause' : cursor >= toMs ? 'Replay' : 'Play'}
            </button>
            <span className="slider-cursor">{fmtDate(cursor)}</span>
          </div>
        </div>

        {/* replay slider + icon timeline (same icons as the graph) */}
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
            return (
              <button
                key={ev.id}
                className="tl-event"
                title={`${ev.title} — ${fmtDate(ms)}`}
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
                  title={isHidden ? 'Click to show' : 'Click to hide'}
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
                >
                  <title>{isHidden ? `Click to show “${n.label}”` : `Click to hide “${n.label}”`}</title>
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
          <span className="lg-note">
            Same icons run across the replay strip and the graph. Ring/diamond color = risk
            direction:
          </span>
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
      <div className="panel signals-panel" id="sec-signals">
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
      </div>

      {/* ── memo ── */}
      <div className="panel memo" id="vantage-memo">
        <div className="memo-head">
          <h2 style={{ margin: 0 }}>
            Diligence memo · {titleCase(dossier.target)} · {memo.asOf} · {memo.lookbackDays}-day lookback
          </h2>
          <button className="playbtn no-print" onClick={() => window.print()}>
            ⤓ export PDF
          </button>
        </div>

        <div className="memo-section">
          <div className="memo-label">Executive summary</div>
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

          {/* confidence + sources at the bottom of the summary */}
          <div className="summary-foot">
            <span
              className={`conf-pill ${memo.confidence >= 0.8 ? 'hi' : memo.confidence >= 0.6 ? 'mid' : 'lo'}`}
              title="Average source confidence across the relations behind this summary"
            >
              {Math.round(memo.confidence * 100)}% confidence
            </span>
            {memo.summaryCitations.length > 0 && (
              <div className="summary-cites">
                <span className="sc-label">Sources:</span>
                {memo.summaryCitations.map((c, i) => (
                  <a key={i} href={c.url} target="_blank" rel="noreferrer" className="sc-chip">
                    [{i + 1}] {c.host} · {c.date}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="memo-section">
          <div className="memo-label">Timeline</div>
          {memo.timeline.length === 0 ? (
            <div className="empty">No timestamped events in window.</div>
          ) : (
            <table className="memo-tl">
              <tbody>
                {memo.timeline.map((t, i) => (
                  <tr key={i}>
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
                          [{i + 1}]
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="memo-section">
          <div className="memo-label">Risk narrative</div>
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
          <div className="memo-label">Analog pattern</div>
          <p className="memo-text">
            This {memo.lookbackDays}-day pattern most resembles{' '}
            {memo.analog
              .slice(0, 2)
              .map((m) => `${m.name} (${m.similarity.toFixed(2)})`)
              .join(' and ')}
            .
          </p>
        </div>

        <div className="memo-foot">
          Sources: {dossier.relations.reduce((n, r) => n + r.sources.length, 0)} citations ·{' '}
          {dossier.events.length} events · {memo.lookbackDays}-day lookback
        </div>
      </div>
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
