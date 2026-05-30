import Link from 'next/link';
import { buildDossier } from '@/lib/pipeline';
import { isDemoMode, getDemoTarget, listDemoTargets } from '@/lib/fixtures';
import { Dashboard } from './Dashboard';

export default async function AccountPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const target = decodeURIComponent(domain);

  if (isDemoMode() && !getDemoTarget(target)) {
    const demos = listDemoTargets();
    return (
      <main className="shell">
        <Link href="/" className="back">
          &larr; all targets
        </Link>
        <div style={{ padding: '3rem 0', maxWidth: 560 }}>
          <h2 style={{ marginBottom: '0.5rem' }}>{target}</h2>
          <p style={{ color: 'var(--text-faint)', marginBottom: '1.5rem' }}>
            No pre-cached data for this domain. In demo mode only the three fixture targets are
            available. To run live diligence, set <code>DEMO_MODE=0</code> in{' '}
            <code>.env.local</code>.
          </p>
          <p style={{ color: 'var(--text-faint)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            Try one of the pre-cached targets:
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

  const dossier = await buildDossier(target);
  const demo = isDemoMode();

  return (
    <main className="shell">
      <Link href="/" className="back">
        &larr; all targets
      </Link>
      <Dashboard dossier={dossier} demoMode={demo} />
      <div className="footer">
        Every claim is cited to its scraped source &middot; <span>Bright Data</span> +{' '}
        <span>Claude</span>
      </div>
    </main>
  );
}
