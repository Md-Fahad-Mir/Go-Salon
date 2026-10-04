import { cn } from '../../utils/cn';

interface ThumbProps {
  /** A data URL or https link. Anything else — blank, an icon name — draws
      the pinstripe placeholder instead of a broken image. */
  src?: string;
  size?: 'md' | 'lg';
}

const isPicture = (value: string | undefined): value is string =>
  Boolean(value) && /^(data:image\/|https?:\/\/)/.test(value as string);

/** A picture in the thumb frame — a hairstyle's primary image — or the
    placeholder when there is none. Decorative: the row beside it names it. */
export function Thumb({ src, size = 'md' }: ThumbProps) {
  return (
    <span className={cn('thumb', size === 'lg' && 'thumb-lg')} aria-hidden="true">
      {isPicture(src) ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span className="thumb-art" />}
    </span>
  );
}
