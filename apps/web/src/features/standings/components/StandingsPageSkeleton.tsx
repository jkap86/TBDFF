import { Skeleton } from '@/components/ui/Skeleton';

export function StandingsPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-8 w-32" />
        </div>

        <div className="rounded-lg bg-card p-6 shadow space-y-3">
          {/* Header row */}
          <div className="flex gap-4 pb-2 border-b border-border">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-12" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-1">
              <Skeleton className="h-5 w-6" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-6" />
              <Skeleton className="h-5 w-6" />
              <Skeleton className="h-5 w-6" />
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
