/** The coloured dot that stands for a payment method. Purely decorative — the
    method is always written out next to it, so colour is never the only cue. */
export function MethodDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="pb-dot"
      aria-hidden="true"
      style={{ backgroundColor: color, width: `${size}px`, height: `${size}px` }}
    />
  );
}
