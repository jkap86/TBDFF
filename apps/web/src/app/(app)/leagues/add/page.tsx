'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateTab } from '@/features/leagues/components/CreateTab';
import { JoinTab } from '@/features/leagues/components/JoinTab';
import { InvitesTab } from '@/features/leagues/components/InvitesTab';

type Tab = 'create' | 'join' | 'invites';

const tabs: { key: Tab; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'join', label: 'Join' },
  { key: 'invites', label: 'Invites' },
];

export default function AddLeaguePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('create');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.push('/leagues')}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Leagues
        </button>

        <h1 className="mb-6 text-3xl font-bold text-gray-900">Add League</h1>

        {/* Tabs */}
        <div className="mb-6 flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'create' && <CreateTab />}
        {activeTab === 'join' && <JoinTab />}
        {activeTab === 'invites' && <InvitesTab />}
      </div>
    </div>
  );
}
