import Link from 'next/link';

const DEMO_TARGETS = [
  {
    domain: 'spirit.com',
    why: 'Distress arc - blocked JetBlue merger, P&W groundings, pilot furloughs, Chapter 11, CEO exit.',
    ready: true,
  },
  {
    domain: 'wiz.io',
    why: 'Breakout growth - $300M Series D to the record $32B Google acquisition, with $500M ARR en route.',
    ready: true,
  },
  {
    domain: 'everlane.com',
    why: 'Mixed signal - union layoffs, transparency backlash, repeated CEO churn, then Shein acquisition.',
    ready: true,
  },
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <h1>Time-travel for the open web</h1>
        <p>
          Drag the slider. See what changed. Catch what others missed. Vantage turns the
          open web into a queryable, time-aware knowledge graph for any company.
        </p>

        <form className="search" action="/account" method="get">
          <input
            name="domain"
            placeholder="spirit.com"
            defaultValue=""
            aria-label="Company domain"
          />
          <select name="days" defaultValue="30" aria-label="Lookback window" className="lookback">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
          </select>
          <button className="btn" type="submit">
            Run diligence
          </button>
        </form>
        <p className="search-hint">
          Shorter windows pull less data and finish faster. Default is 30 days.
        </p>
      </section>

      <div className="cards">
        {DEMO_TARGETS.map((t) => {
          const card = (
            <div className={`card${t.ready ? '' : ' disabled'}`}>
              <div className="domain">{t.domain}</div>
              <div className="why">{t.why}</div>
              <span className="tag">{t.ready ? 'pre-cached · instant' : 'coming soon'}</span>
            </div>
          );
          return t.ready ? (
            <Link key={t.domain} href={`/account/${t.domain}`}>
              {card}
            </Link>
          ) : (
            <div key={t.domain}>{card}</div>
          );
        })}
      </div>

      <div className="footer">
        Powered by <span>Bright Data</span> continuous capture + <span>Claude</span> structured
        extraction.
      </div>
    </main>
  );
}
