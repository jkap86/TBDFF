'use client';

import Link from 'next/link';
import { useAuth } from '@/features/auth/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, <span className="font-medium">{user?.username}</span>
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/leagues"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Leagues
          </Link>
        </div>
      </div>
    </div>
  );
}
