'use client';

import type { Draft, UpdateDraftRequest } from '@/lib/api';
import { DraftSettingsForm } from './DraftSettingsForm';

interface DraftSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  draft: Draft;
  onSave: (updates: UpdateDraftRequest) => Promise<void>;
}

export function DraftSettingsModal({ isOpen, onClose, draft, onSave }: DraftSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Draft Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <DraftSettingsForm
          draft={draft}
          onSave={onSave}
          onSaveSuccess={onClose}
          readOnly={false}
        />
      </div>
    </div>
  );
}
