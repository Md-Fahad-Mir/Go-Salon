import { initialsOf } from '../../utils/format';
import { cn } from '../../utils/cn';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  accent?: boolean;
}

export function Avatar({ name, size = 'md', accent = false }: AvatarProps) {
  return (
    <span
      className={cn('avatar', size === 'sm' && 'avatar-sm', size === 'lg' && 'avatar-lg', accent && 'avatar-accent')}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
