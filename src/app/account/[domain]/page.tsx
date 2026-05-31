import Link from 'next/link';
import { buildDossier } from '@/lib/pipeline';
import { isDemoTarget, listDemoTargets } from '@/lib/fixtures';
import { env } from '@/lib/env';
import { Dashboard } from './Dashboard';

const ALLOWED_DAYS = [30, 90, 180];

/** Friendly, server-rendered fallback that never throws — keeps a failed or
 *  unsupported target from tearing down the RSC stream. Always offers the
 *  pre-cached targets, which load instantly. */
function Fallback({ target, body }: { target: string; body: React.ReactNode }) {
  const demos = listDemoTargets();
  return (
    <main className="shell">
      <Link href="/" className="back">
        &larr; all targets
      </Link>
      <div style={{ padding: '3rem 0', maxWidth: 560 }}>
        <h2 style={{ marginBottom: '0.5rem' }}>{target}</h2>
        <p style={{ color: 'var(--text-faint)', marginBottom: '1.5rem' }}>{body}</p>
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
  const hasKey = Boolean(env('ANTHROPIC_API_KEY'));

  // A synchronous live scrape takes ~80s, but serverless request limits are far
  // shorter (Netlify ~10–26s). On those hosts the platform kills the function
  // mid-request — no try/catch can recover, and the dropped connection surfaces
  // as "Connection closed". So on a constrained host we DON'T attempt a live
  // fetch for typed-in domains; pre-cached targets still render instantly
  // (fixtures, no network). Override with ALLOW_LIVE_FETCH=1 on a host that
  // permits long requests.
  const constrainedHost =
    (process.env.NETLIFY === 'true' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)) &&
    process.env.ALLOW_LIVE_FETCH !== '1';

  // Typed-in domains that we can't (or won't) fetch live → friendly message
  // instead of an empty dashboard or a crash. Registered targets always render
  // from fixtures regardless of host.
  if (!hasFixture && !hasKey) {
    return (
      <Fallback
        target={target}
        body={
          <>
            No pre-cached data for this domain, and no <code>ANTHROPIC_API_KEY</code> is configured
            to run it live. Add your keys to <code>.env.local</code> to fetch any domain, or try a
            pre-cached target below.
          </>
        }
      />
    );
  }
  if (!hasFixture && constrainedHost) {
    return (
      <Fallback
        target={target}
        body={
          <>
            Live scraping <strong>{target}</strong> takes about a minute — longer than this hosted
            demo&apos;s request limit allows, so it&apos;s disabled here. Run the app locally to
            fetch any domain live, or explore a pre-cached target below (these load instantly).
          </>
        }
      />
    );
  }

  // A live fetch can take ~80s and reaches Bright Data over a long-lived MCP/SSE
  // connection. On serverless hosts (Netlify / Vercel) the function can time out
  // and cut the connection — the MCP SDK then throws "Connection closed". Catch
  // it here so the route renders a friendly fallback instead of tearing down the
  // RSC stream (which the browser surfaces as a cryptic "Application error: a
  // client-side exception has occurred").
  let dossier;
  try {
    dossier = await buildDossier(target, { lookbackDays });
  } catch (err) {
    console.error(`buildDossier failed for ${target}:`, err);
    return (
      <Fallback
        target={target}
        body={
          <>
            We couldn&apos;t finish building a live dossier for <strong>{target}</strong> just now —
            a live scrape can take over a minute, which may exceed this host&apos;s request limit.
            The pre-cached targets below load instantly, or try again in a moment.
          </>
        }
      />
    );
  }

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
