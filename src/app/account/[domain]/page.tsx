import Link from 'next/link';
import { buildDossier } from '@/lib/pipeline';
import { isDemoTarget, listDemoTargets } from '@/lib/fixtures';
import { env } from '@/lib/env';
import { Dashboard } from './Dashboard';

const ALLOWED_DAYS = [30, 90, 180];

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { domain } = await params;
  const { days } = await searchParams;
  const target = decodeURIComponent(domain);
  const lookbackDays = ALLOWED_DAYS.includes(Number(days)) ? Number(days) : 30;

  const hasFixture = isDemoTarget(target);
  const canFetchLive = Boolean(env('ANTHROPIC_API_KEY'));

  // Unknown (typed-in) domain with no way to fetch it live → friendly message
  // instead of an empty dashboard. Registered targets always render from fixtures.
  if (!hasFixture && !canFetchLive) {
    const demos = listDemoTargets();
    return (
      <main className="shell">
        <Link href="/" className="back">
          &larr; all targets
        </Link>
        <div style={{ padding: '3rem 0', maxWidth: 560 }}>
          <h2 style={{ marginBottom: '0.5rem' }}>{target}</h2>
          <p style={{ color: 'var(--text-faint)', marginBottom: '1.5rem' }}>
            No pre-cached data for this domain, and no <code>ANTHROPIC_API_KEY</code> is configured
            to run it live. Add your keys to <code>.env.local</code> to fetch any domain, or try a
            pre-cached target below.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {demos.map((d) => (
              <Link key={d} href={`/account/${d}`} className="btn" style={{ fontSize: '0.85rem' }}>
                {d}
              </Link>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const dossier = await buildDossier(target, { lookbackDays });

  return (
    <main className="shell">
      <Link href="/" className="back">
        &larr; all targets
      </Link>
      {/* demoMode=false so citation links navigate to their real source URLs */}
      <Dashboard dossier={dossier} demoMode={false} />
      <div className="footer">
        Every claim is cited to its scraped source &middot; <span>Bright Data</span> +{' '}
        <span>Claude</span>
      </div>
    </main>
  );
}
