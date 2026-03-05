import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-6 text-center">
        <h1 className="text-4xl font-bold font-heading gradient-text glow-text-strong">TBDFF</h1>
        <p className="text-muted-foreground">Fantasy Football</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-primary-foreground glow-primary"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent glow-border"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
