import { Skeleton } from '@/components/ui/Skeleton';

export function DraftRoomSkeleton() {
  return (
    <div className="min-h-screen bg-surface p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Controls placeholder */}
        <Skeleton className="h-16 w-full rounded-lg" />

        {/* Board + Sidebar */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div className="rounded-lg bg-card p-4 shadow">
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </div>
          </div>
          <div className="w-80 shrink-0">
            <div className="rounded-lg bg-card p-4 shadow">
              <Skeleton className="mb-3 h-8 w-full rounded" />
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
