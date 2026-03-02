import { Skeleton } from '@/components/ui/Skeleton';

export function LeagueDetailSkeleton() {
  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* League Header Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <div className="mb-4 flex items-start justify-between">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-1 h-4 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </div>

        {/* Draft Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-1 h-4 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>

        {/* Trades link card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <Skeleton className="mb-2 h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Members Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <Skeleton className="mb-4 h-7 w-36" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-border p-3">
                <div>
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="mt-1 h-4 w-20" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
