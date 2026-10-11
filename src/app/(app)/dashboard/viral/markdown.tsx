import { Fragment, type ReactNode } from "react";

// Rendu du Markdown simple des réponses (titres, listes, gras, italique,
// code, liens http). Construit en éléments React : aucun HTML injecté.
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const k = `${key}-${i++}`;
    if (match[1]) out.push(<strong key={k} className="font-semibold text-text">{match[1]}</strong>);
    else if (match[2]) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-0.5 text-[0.85em]">{match[2]}</code>);
    else if (match[3])
      out.push(
        <a key={k} href={match[4]} target="_blank" rel="noreferrer" className="text-accent-light underline underline-offset-2">
          {match[3]}
        </a>,
      );
    else if (match[5]) out.push(<em key={k}>{match[5]}</em>);
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const k = `p${blocks.length}`;
    blocks.push(
      <p key={k}>
        {paragraph.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {inline(line, `${k}-${i}`)}
          </Fragment>
        ))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, `${k}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={k} className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul key={k} className="list-disc space-y-1 pl-5">{items}</ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim() || /^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(
        <p key={k} className={`font-semibold text-text ${heading[1].length <= 2 ? "text-base" : "text-sm"}`}>
          {inline(heading[2], k)}
        </p>,
      );
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered && !bullet);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return <div className="space-y-3 text-sm leading-relaxed text-muted">{blocks}</div>;
}
