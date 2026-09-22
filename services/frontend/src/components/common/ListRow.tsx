import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

interface ListRowProps {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  chevron?: boolean;
  href?: string;
}

/** Settings-style row: icon, text, trailing value, chevron. */
export function ListRow({ icon, title, sub, end, to, onClick, danger, chevron = true, href }: ListRowProps) {
  const inner = (
    <>
      {icon ? <span className="list-row-icon">{icon}</span> : null}
      <span className="list-row-body">
        <span className="list-row-title">{title}</span>
        {sub ? <span className="list-row-sub">{sub}</span> : null}
      </span>
      <span className="list-row-end">
        {end}
        {chevron && (to || onClick || href) ? <ChevronRight size={18} aria-hidden="true" /> : null}
      </span>
    </>
  );
  const className = cn('list-row', danger && 'list-row-danger');
  if (to) return <Link to={to} className={className}>{inner}</Link>;
  if (href) return <a href={href} className={className} target="_blank" rel="noreferrer">{inner}</a>;
  if (onClick) return <button type="button" className={className} onClick={onClick}>{inner}</button>;
  return <div className={className}>{inner}</div>;
}

export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('list-card', className)}>{children}</div>;
}
