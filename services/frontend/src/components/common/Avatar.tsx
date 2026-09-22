import { cn } from '../../utils/cn';
import { initialsOf } from '../../utils/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  accent?: boolean;
  ring?: boolean;
  className?: string;
}

export function Avatar({ name, src, size = 'md', accent, ring, className }: AvatarProps) {
  return (
    <span className={cn('avatar', `avatar-${size}`, accent && 'avatar-accent', ring && 'avatar-ring', className)} aria-hidden={src ? undefined : true}>
      {src ? <img src={src} alt={name} /> : initialsOf(name)}
    </span>
  );
}
