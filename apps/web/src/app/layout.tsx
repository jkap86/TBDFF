import type { Metadata } from 'next';
import { AuthProvider } from '@/features/auth/context/AuthProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DevPanel } from '@/features/dev/DevPanel';
import './globals.css';

export const metadata: Metadata = {
  title: 'TBDFF',
  description: 'TBDFF Fantasy Football',
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
            <DevPanel />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
