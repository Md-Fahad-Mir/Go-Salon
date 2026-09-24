interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '1rem', radius, className }: SkeletonProps) {
  return <span className={`skeleton ${className ?? ''}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** Rows in a `.list-card` — a price list, a set of chairs. Shaped like what
    is coming so the page does not resize under the reader when it lands. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="list-card" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="list-row">
          <span className="list-row-body">
            <Skeleton width="45%" height="0.9375rem" />
            <Skeleton width="25%" height="0.8125rem" />
          </span>
          <Skeleton width="3.5rem" height="0.9375rem" />
        </div>
      ))}
    </div>
  );
}
