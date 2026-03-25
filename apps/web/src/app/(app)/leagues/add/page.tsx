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
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold text-foreground text-center">Add League</h1>

        {/* Tabs */}
        <div className="mb-6 flex border-b border-border justify-evenly">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-accent-foreground'
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
