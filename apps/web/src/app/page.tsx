import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold">TBDFF</h1>
        <p className="text-muted-foreground">Fantasy Football</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
