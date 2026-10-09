import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'LIVIA | Living Interactive Virtual Intelligent Assistant',
  description: 'Get LIVIA from CYBERSTARLINK. A local-first browser assistant for offline page understanding, saved-page search, and permissioned AI tasks.'
};

export const viewport: Viewport = {
  themeColor: '#101310'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
