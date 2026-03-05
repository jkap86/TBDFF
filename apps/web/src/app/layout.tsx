import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { AuthProvider } from '@/features/auth/context/AuthProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { QueryProvider } from '@/components/QueryProvider';
import { DevPanel } from '@/features/dev/DevPanel';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-heading',
});

export const metadata: Metadata = {
  title: 'TBDFF',
  description: 'TBD Fantasy Football',
};

const themeScript = `
  (function() {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={spaceGrotesk.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <ErrorBoundary>{children}</ErrorBoundary>
              <DevPanel />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
