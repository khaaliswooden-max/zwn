import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import StatusBar from '@/components/StatusBar';

export const metadata: Metadata = {
  title: 'ZWN — Zuup World Network',
  description: 'Zuup World Model developer portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {/* pt-11 = nav height, pb-9 = status bar height */}
        <main className="pt-11 pb-9 min-h-screen">
          {children}
        </main>
        <StatusBar />
      </body>
    </html>
  );
}
