'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary for /account/[domain]. Next.js renders this when
 * the server component throws (e.g. a live fetch times out and the Bright Data
 * MCP connection is cut, which the SDK reports as "Connection closed") or when
 * a client component throws during render. Without this, such failures surface
 * as the generic, unhelpful "Application error: a client-side exception has
 * occurred" overlay.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Account route error:', error);
  }, [error]);

  return (
    <main className="shell">
      <Link href="/" className="back">
        &larr; all targets
      </Link>
      <div style={{ padding: '3rem 0', maxWidth: 560 }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Something interrupted this dossier</h2>
        <p style={{ color: 'var(--text-faint)', marginBottom: '1.5rem' }}>
          A live scrape can take over a minute and reaches the open web through Bright Data — on a
          hosted demo that occasionally exceeds the request limit and the connection is dropped.
          Retry, or jump to a pre-cached target that loads instantly.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => reset()} style={{ fontSize: '0.85rem' }}>
            Try again
          </button>
          <Link href="/" className="btn" style={{ fontSize: '0.85rem' }}>
            All targets
          </Link>
        </div>
      </div>
    </main>
  );
}
