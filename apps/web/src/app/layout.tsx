import type { Metadata } from 'next';
import { AuthProvider } from '@/features/auth/context/AuthProvider';
import { DevPanel } from '@/features/dev/DevPanel';
import './globals.css';

export const metadata: Metadata = {
  title: 'TBDFF',
  description: 'TBDFF Fantasy Football',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white font-sans antialiased">
        <AuthProvider>
          {children}
          <DevPanel />
        </AuthProvider>
      </body>
    </html>
  );
}
