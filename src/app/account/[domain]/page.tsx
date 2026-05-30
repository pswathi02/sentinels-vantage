import Link from 'next/link';
import { buildDossier } from '@/lib/pipeline';
import { Dashboard } from './Dashboard';

export default async function AccountPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const target = decodeURIComponent(domain);
  const dossier = await buildDossier(target);

  return (
    <main className="shell">
      <Link href="/" className="back">
        ← all targets
      </Link>
      <Dashboard dossier={dossier} />
      <div className="footer">
        Every claim is cited to its scraped source · <span>Bright Data</span> +{' '}
        <span>Claude</span>
      </div>
    </main>
  );
}
