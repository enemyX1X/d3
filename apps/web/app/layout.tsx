import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'LIVIA | Living Interactive Virtual Intelligence Avatar',
  description: 'A persistent AI companion that follows you, transforms, plays, creates and rebuilds the digital world around you.'
};

export const viewport: Viewport = {
  themeColor: '#05070d'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
