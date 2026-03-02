import { Skeleton } from '@/components/ui/Skeleton';

export function WaiversPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-8 w-52" />
        </div>

        {/* Pending Claims Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <Skeleton className="mb-4 h-6 w-44" />
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-border p-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-7 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Roster Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <Skeleton className="mb-4 h-6 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-border p-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-7 w-14 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
