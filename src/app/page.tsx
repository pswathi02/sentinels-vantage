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
        <h1>Due diligence, on a timeline</h1>
        <p>
          Vantage assembles a time-aware knowledge graph of any company from public web
          sources — leadership changes, litigation, layoffs, pricing, and sentiment — so you
          can scrub back through its recent history. Every fact links to its original source.
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
          Choose how far back to look. Shorter windows return results faster — 30 days is a
          good place to start.
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
