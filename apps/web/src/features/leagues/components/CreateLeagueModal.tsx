'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; season: string; total_rosters: number }) => Promise<void>;
}

export function CreateLeagueModal({ isOpen, onClose, onCreate }: CreateLeagueModalProps) {
  const [name, setName] = useState('');
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [totalRosters, setTotalRosters] = useState(12);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('League name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreate({ name: name.trim(), season, total_rosters: totalRosters });
      setName('');
      setSeason(new Date().getFullYear().toString());
      setTotalRosters(12);
      onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">Create New League</h2>

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

          <div className="mb-6">
            <label
              htmlFor="totalRosters"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create League'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
