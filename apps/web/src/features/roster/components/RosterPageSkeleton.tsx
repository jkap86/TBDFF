import { Skeleton } from '@/components/ui/Skeleton';

function PlayerRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Skeleton className="h-6 w-8 rounded-full" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-12 rounded-full" />
    </div>
  );
}

export function RosterPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>

        <div className="rounded-lg bg-card p-6 shadow space-y-4">
          <Skeleton className="h-5 w-20" />
          <div className="divide-y divide-border">
            {Array.from({ length: 7 }).map((_, i) => (
              <PlayerRowSkeleton key={i} />
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-card p-6 shadow space-y-4">
          <Skeleton className="h-5 w-16" />
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <PlayerRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
