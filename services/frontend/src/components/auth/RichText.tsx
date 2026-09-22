import { Fragment } from 'react';
import type { ReactNode } from 'react';

interface RichTextProps {
  /** An already-translated string still holding `{name}` placeholders. */
  template: string;
  /** Nodes to drop in, keyed by placeholder name. */
  nodes: Record<string, ReactNode>;
}

/** Renders a translated sentence that carries inline markup — a link, a bold
    phone number, a button — without splitting it into separate keys. The whole
    sentence stays in one entry so a translator can move the pieces around. */
export function RichText({ template, nodes }: RichTextProps) {
  const parts = template.split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^\{(\w+)\}$/.exec(part);
        const node = match ? nodes[match[1]] : undefined;
        return node === undefined ? part : <Fragment key={index}>{node}</Fragment>;
      })}
    </>
  );
}
