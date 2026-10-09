import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'LIVIA | Local AI Workspace',
  description: 'A local-first companion workspace for profiles, project notes, browser controls, and transparent service status.'
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
