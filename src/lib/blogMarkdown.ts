export type MarkdownBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: Array<{ text: string; extraParagraphs: string[]; subItems: string[] }> }
  | { type: 'table'; headers: string[]; rows: string[][] };

function isSpecialBlockStart(trimmed: string): boolean {
  return (
    /^#{2,4}\s+/.test(trimmed) ||
    /^---+\s*$/.test(trimmed) ||
    trimmed.startsWith('|') ||
    /^-\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed)
  );
}

function nextNonEmptyIndex(lines: string[], start: number): number {
  let idx = start;
  while (idx < lines.length && lines[idx].trim() === '') idx += 1;
  return idx;
}

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+\s*$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const dataRows = tableLines.filter((r) => !/^\|\s*:?-{2,}/.test(r));
      const parseCells = (row: string) =>
        row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      const [headerRow, ...bodyRows] = dataRows;
      blocks.push({
        type: 'table',
        headers: headerRow ? parseCells(headerRow) : [],
        rows: bodyRows.map(parseCells),
      });
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        if (!curTrim) break;
        const bulletMatch = curTrim.match(/^-\s+(.+)$/);
        if (bulletMatch) {
          items.push(bulletMatch[1].trim());
          i += 1;
          continue;
        }
        if (isSpecialBlockStart(curTrim) || items.length === 0) break;
        items[items.length - 1] = `${items[items.length - 1]} ${curTrim}`;
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: Array<{ text: string; extraParagraphs: string[]; subItems: string[] }> = [];
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        if (!curTrim) {
          const nextIdx = nextNonEmptyIndex(lines, i + 1);
          if (nextIdx < lines.length && /^\d+\.\s+/.test(lines[nextIdx].trim())) {
            i = nextIdx;
            continue;
          }
          break;
        }
        const orderedMatch = curTrim.match(/^\d+\.\s+(.+)$/);
        if (!orderedMatch) break;

        const item = { text: orderedMatch[1].trim(), extraParagraphs: [] as string[], subItems: [] as string[] };
        i += 1;

        while (i < lines.length) {
          const subRaw = lines[i];
          const subTrim = subRaw.trim();
          if (!subTrim) {
            const nextIdx = nextNonEmptyIndex(lines, i + 1);
            if (nextIdx < lines.length && /^\s{2,}(?:-\s+|\S)/.test(lines[nextIdx]) && !/^\d+\.\s+/.test(lines[nextIdx].trim())) {
              i = nextIdx;
              continue;
            }
            break;
          }
          if (/^\d+\.\s+/.test(subTrim) || /^#{2,4}\s+/.test(subTrim) || /^---+\s*$/.test(subTrim) || subTrim.startsWith('|')) {
            break;
          }
          const subBullet = subTrim.match(/^-\s+(.+)$/);
          if (subBullet) {
            item.subItems.push(subBullet[1].trim());
            i += 1;
            continue;
          }
          if (item.subItems.length > 0 && /^\s{4,}/.test(subRaw)) {
            item.subItems[item.subItems.length - 1] = `${item.subItems[item.subItems.length - 1]} ${subTrim}`;
          } else if (item.extraParagraphs.length > 0 && /^\s{2,}/.test(subRaw)) {
            item.extraParagraphs[item.extraParagraphs.length - 1] = `${item.extraParagraphs[item.extraParagraphs.length - 1]} ${subTrim}`;
          } else {
            item.extraParagraphs.push(subTrim);
          }
          i += 1;
        }

        items.push(item);
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const curTrim = lines[i].trim();
      if (!curTrim || isSpecialBlockStart(curTrim)) break;
      paraLines.push(curTrim);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}
