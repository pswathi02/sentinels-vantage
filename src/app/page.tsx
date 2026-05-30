import Link from 'next/link';

const DEMO_TARGETS = [
  {
    domain: 'peloton.com',
    why: 'Public 2022–2024 collapse — CFO churn, Glassdoor crash, layoffs, lawsuits. Rich, undeniable signal.',
    ready: true,
  },
  {
    domain: 'wework.com',
    why: 'Classic pre-bankruptcy unraveling.',
    ready: false,
  },
  {
    domain: 'klaviyo.com',
    why: 'Positive ramp pre-IPO — proves the tool isn’t doom-only.',
    ready: false,
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
            placeholder="peloton.com"
            defaultValue=""
            aria-label="Company domain"
          />
          <button className="btn" type="submit">
            Run diligence
          </button>
        </form>
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
