'use client';

import { useEffect } from 'react';

/**
 * App-wide last-resort error boundary. Replaces Next.js's default
 * "Application error: a client-side exception has occurred" overlay with a
 * branded, actionable screen. Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0e14',
          color: '#e8edf6',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: 480, padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem' }}>Something went wrong</h2>
          <p style={{ color: '#9fb0c8', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            The page hit an unexpected error. Reloading usually clears it; if not, head back to the
            home screen and pick a pre-cached target.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                background: '#4f9dff',
                color: '#06101f',
                border: 'none',
                borderRadius: 8,
                padding: '0.6rem 1.2rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <a
              href="/"
              style={{
                background: 'transparent',
                color: '#e8edf6',
                border: '1px solid #2a3549',
                borderRadius: 8,
                padding: '0.6rem 1.2rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
