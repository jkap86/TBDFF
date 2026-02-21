'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/features/auth/hooks/useAuth';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-600">
          Welcome, <span className="font-medium">{user?.username}</span>
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/leagues"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            My Leagues
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
