'use client';

import { useState, useEffect } from 'react';
import { ApiError } from '@/lib/api';
import type { League, UpdateLeagueRequest, LeagueStatus } from '@tbdff/shared';

interface LeagueSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  league: League;
  onUpdate: (data: UpdateLeagueRequest) => Promise<void>;
  onDelete: () => Promise<void>;
  isOwner: boolean;
}

export function LeagueSettingsModal({ isOpen, onClose, league, onUpdate, onDelete, isOwner }: LeagueSettingsModalProps) {
  const [name, setName] = useState(league.name);
  const [totalRosters, setTotalRosters] = useState(league.total_rosters);
  const [status, setStatus] = useState<LeagueStatus>(league.status);
  const [isPublic, setIsPublic] = useState(league.settings?.public === 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form when league changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(league.name);
      setTotalRosters(league.total_rosters);
      setStatus(league.status);
      setIsPublic(league.settings?.public === 1);
      setError(null);
      setShowDeleteConfirmation(false);
      setIsDeleting(false);
    }
  }, [isOpen, league]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build update object with only changed fields
    const updates: UpdateLeagueRequest = {};
    if (name.trim() !== league.name) {
      if (!name.trim()) {
        setError('League name cannot be empty');
        return;
      }
      if (name.trim().length > 100) {
        setError('League name must be 100 characters or less');
        return;
      }
      updates.name = name.trim();
    }
    if (totalRosters !== league.total_rosters) {
      if (totalRosters < 2 || totalRosters > 32) {
        setError('Total rosters must be between 2 and 32');
        return;
      }
      updates.total_rosters = totalRosters;
    }
    if (status !== league.status) {
      updates.status = status;
    }
    const currentIsPublic = league.settings?.public === 1;
    if (isPublic !== currentIsPublic) {
      updates.settings = { public: isPublic ? 1 : 0 };
    }

    // Skip if no changes
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onUpdate(updates);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to update league settings');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await onDelete();
      // Modal will close when parent navigates away
    } catch (err) {
      setShowDeleteConfirmation(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to delete league');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-gray-900">League Settings</h2>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              League Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="My League"
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="totalRosters" className="mb-1 block text-sm font-medium text-gray-700">
              Number of Teams
            </label>
            <select
              id="totalRosters"
              value={totalRosters}
              onChange={(e) => setTotalRosters(parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              {[...Array(31)].map((_, i) => {
                const num = i + 2; // 2 to 32
                return (
                  <option key={num} value={num}>
                    {num}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">
              League Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeagueStatus)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="pre_draft">Pre-Draft</option>
              <option value="drafting">Drafting</option>
              <option value="in_season">In Season</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="mb-6">
            <label htmlFor="visibility" className="mb-1 block text-sm font-medium text-gray-700">
              League Visibility
            </label>
            <select
              id="visibility"
              value={isPublic ? 'public' : 'private'}
              onChange={(e) => setIsPublic(e.target.value === 'public')}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="public">Public - Anyone can find and join</option>
              <option value="private">Private - Invite only</option>
            </select>
          </div>

          {isOwner && (
            <div className="mb-6 border-t border-gray-300 pt-6">
              <h3 className="mb-2 text-sm font-semibold text-red-600">Danger Zone</h3>

              {!showDeleteConfirmation ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmation(true)}
                  className="w-full rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  disabled={isSubmitting || isDeleting}
                >
                  Delete League
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded bg-red-50 p-3 text-sm text-red-800">
                    <p className="font-medium">Are you sure you want to delete this league?</p>
                    <p className="mt-1">This action cannot be undone. All league data will be permanently deleted.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirmation(false)}
                      className="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting || isDeleting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
