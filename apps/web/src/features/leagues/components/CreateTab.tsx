'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { leagueApi, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function CreateTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [name, setName] = useState('');
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [totalRosters, setTotalRosters] = useState(12);
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('League name is required');
      return;
    }
    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const result = await leagueApi.create(
        { name: name.trim(), season, total_rosters: totalRosters, settings: { public: isPublic ? 1 : 0 } },
        accessToken,
      );
      router.push(`/leagues/${result.league.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create league');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Create New League</h2>

      {error && (
        <div className="mb-4 rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            League Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="My League"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="season" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Season
          </label>
          <input
            id="season"
            type="text"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="2024"
            pattern="^\d{4}$"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={isSubmitting}
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Public league</span>
          </label>
          <p className="mt-1 ml-7 text-xs text-gray-500 dark:text-gray-400">
            Anyone can browse and join public leagues
          </p>
        </div>

        <div className="mb-6">
          <label htmlFor="totalRosters" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Number of Teams
          </label>
          <select
            id="totalRosters"
            value={totalRosters}
            onChange={(e) => setTotalRosters(parseInt(e.target.value, 10))}
            className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={isSubmitting}
          >
            {[8, 10, 12, 14, 16].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create League'}
        </button>
      </form>
    </div>
  );
}
