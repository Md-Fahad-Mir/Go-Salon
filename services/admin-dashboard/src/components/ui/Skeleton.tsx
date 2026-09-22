interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
}

export function Skeleton({ width = '100%', height = '1rem', radius }: SkeletonProps) {
  return <span className="skeleton" style={{ display: 'block', width, height, borderRadius: radius }} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="stack-sm" style={{ padding: '1rem' }} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height="2.5rem" />
      ))}
    </div>
  );
}
