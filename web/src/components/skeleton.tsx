import { cn } from '@/lib/utils';

interface SkProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Sk({ className, style }: SkProps) {
  return <div className={cn('shimmer', className)} style={style} aria-hidden="true" />;
}

Sk.Line = function SkLine({ w = 'w-full', h = 'h-3', className }: { w?: string; h?: string; className?: string }) {
  return <Sk className={cn(w, h, className)} />;
};

Sk.Card = function SkCard({ className }: SkProps) {
  return (
    <div className={cn('card p-4 lg:p-5', className)}>
      <Sk.Line w="w-20" h="h-2.5" className="mb-3" />
      <Sk.Line w="w-32" h="h-7" className="mb-2" />
      <Sk.Line w="w-24" h="h-2.5" />
    </div>
  );
};

Sk.Row = function SkRow({ cols = 3, className }: { cols?: number; className?: string }) {
  const widths = ['w-24', 'w-full', 'w-16', 'w-20', 'w-28', 'w-12'];
  return (
    <div className={cn('flex items-center gap-4 px-5 py-3', className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <Sk.Line key={i} w={widths[i % widths.length]} h="h-3" />
      ))}
    </div>
  );
};

Sk.TableRow = function SkTableRow({ cols, className }: { cols: string[]; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 px-5 py-3', className)}>
      {cols.map((w, i) => (
        <Sk.Line key={i} w={w} h="h-3" />
      ))}
    </div>
  );
};

Sk.BlockRow = function SkBlockRow() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-[120px_1fr_80px_100px_100px_140px_120px] gap-3 px-5 py-3 items-center">
      <Sk.Line w="w-20" h="h-3.5" />
      <Sk.Line w="w-40" h="h-3" className="hidden md:block" />
      <Sk.Line w="w-10" h="h-3" className="ml-auto" />
      <Sk.Line w="w-12" h="h-3" className="ml-auto" />
      <Sk.Line w="w-16" h="h-3" className="ml-auto hidden md:block" />
      <Sk.Line w="w-20" h="h-3" className="hidden md:block" />
      <Sk.Line w="w-14" h="h-3" className="ml-auto" />
    </div>
  );
};

Sk.TxRow = function SkTxRow() {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <Sk.Line w="w-32" h="h-3" />
      <div className="flex items-center gap-4">
        <Sk.Line w="w-16" h="h-3" />
        <Sk.Line w="w-12" h="h-3" />
        <Sk.Line w="w-14" h="h-3" className="hidden sm:block" />
      </div>
    </div>
  );
};

Sk.TipCard = function SkTipCard() {
  return (
    <div className="card p-6 lg:p-7">
      <div className="flex items-center justify-between mb-4">
        <Sk.Line w="w-12" h="h-5" />
        <Sk.Line w="w-16" h="h-3" />
      </div>
      <div className="flex items-baseline gap-3 mb-5">
        <Sk.Line w="w-40" h="h-10" />
        <Sk.Line w="w-24" h="h-3" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Sk.Line w="w-8" h="h-2" className="mb-2" />
            <Sk.Line w="w-14" h="h-4" />
          </div>
        ))}
      </div>
    </div>
  );
};

Sk.KvRow = function SkKvRow() {
  return (
    <div className="flex items-start justify-between py-3 border-b border-[var(--color-border-soft)] gap-4">
      <Sk.Line w="w-28" h="h-3" />
      <Sk.Line w="w-48" h="h-3" />
    </div>
  );
};

export const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i);
