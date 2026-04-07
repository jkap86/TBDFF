import { Skeleton } from '@/components/ui/Skeleton';

function PlayerRowSkeleton({ showSlot = true }: { showSlot?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2 px-1.5">
      {showSlot && <Skeleton className="h-6 w-8 rounded" />}
      <Skeleton className="h-6 w-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-6 rounded-full" />
    </div>
  );
}

interface RosterPageSkeletonProps {
  starterCount?: number;
  benchCount?: number;
  showHeader?: boolean;
}

export function RosterPageSkeleton({
  starterCount = 7,
  benchCount = 5,
  showHeader = true,
}: RosterPageSkeletonProps = {}) {
  const content = (
    <>
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      )}

      {/* Context strip */}
      <div className="rounded-lg bg-card glass-subtle px-5 py-3 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Lineup card: Starters + Bench in two columns */}
      <div className="rounded-lg bg-card p-2.5 sm:p-4 shadow glass-strong glow-border">
        <div className="grid grid-cols-2">
          {/* Starters column */}
          <div className="pr-2 sm:pr-4">
            <div className="mb-2 flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="divide-y divide-border/50">
              {Array.from({ length: starterCount }).map((_, i) => (
                <PlayerRowSkeleton key={i} />
              ))}
            </div>
          </div>

          {/* Bench column */}
          <div className="border-l border-border/50 pl-2 sm:pl-4">
            <div className="mb-2 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="divide-y divide-border/50">
              {Array.from({ length: benchCount }).map((_, i) => (
                <PlayerRowSkeleton key={i} showSlot={false} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // When used inline by the page, we don't want a wrapper that duplicates the page chrome.
  // When used by Next.js loading.tsx (showHeader=true), we wrap in the page chrome.
  if (showHeader) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-5xl space-y-6">{content}</div>
      </div>
    );
  }
  return <div className="space-y-6">{content}</div>;
}
