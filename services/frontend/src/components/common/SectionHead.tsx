import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface SectionHeadProps {
  title: string;
  action?: { label: string; to: string } | ReactNode;
  as?: 'h2' | 'h3';
}

export function SectionHead({ title, action, as = 'h2' }: SectionHeadProps) {
  const Tag = as;
  const isLink = action && typeof action === 'object' && 'to' in (action as object);
  return (
    <div className="section-head">
      <Tag>{title}</Tag>
      {isLink ? (
        <Link to={(action as { to: string }).to}>
          {(action as { label: string }).label} <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        (action as ReactNode)
      )}
    </div>
  );
}
