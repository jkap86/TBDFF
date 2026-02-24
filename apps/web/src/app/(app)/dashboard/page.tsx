'use client';

import Link from 'next/link';
import { useAuth } from '@/features/auth/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Welcome, <span className="font-medium">{user?.username}</span>
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/leagues"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Leagues
          </Link>
        </div>
      </div>
    </div>
  );
}
