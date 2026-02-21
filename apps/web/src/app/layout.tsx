import type { Metadata } from 'next';
import { AuthProvider } from '@/features/auth/context/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'TBDFF',
  description: 'TBDFF Fantasy Football',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
