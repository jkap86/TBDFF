import { Skeleton } from '@/components/ui/Skeleton';

function BracketSlotSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2 w-44">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-10" />
      </div>
      <div className="border-t border-border" />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-10" />
      </div>
    </div>
  );
}

export function BracketPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-8 w-40" />
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-8 pb-4">
            {Array.from({ length: 3 }).map((_, col) => (
              <div key={col} className="flex flex-col gap-6">
                <Skeleton className="h-4 w-28 mb-2" />
                {Array.from({ length: Math.max(1, 4 >> col) }).map((_, i) => (
                  <BracketSlotSkeleton key={i} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
