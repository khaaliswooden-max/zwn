import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import StatusBar from '@/components/StatusBar';

export const metadata: Metadata = {
  title: 'ZWM — Zuup World Model',
  description: 'Zuup World Model developer portal',
  icons: {
    icon: '/favicon.svg',
  },
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
