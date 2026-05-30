import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vantage — time-travel for the open web',
  description: 'A temporal knowledge graph of the open web for any company.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <a href="/" className="brand">
            VANT<span>AGE</span>
            <small>temporal due diligence · Sentinels × Bright Data</small>
          </a>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)' }}>
            DEMO MODE
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
