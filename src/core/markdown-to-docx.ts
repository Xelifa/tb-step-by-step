import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';

/**
 * Convert a markdown string to a docx Document.
 * Handles:
 *   - # / ## / ### headings
 *   - normal paragraphs
 *   - blank lines as paragraph breaks
 *   - simple "- " / "* " bullets and "1. " numbered lists
 */
export function markdownToDocx(markdown: string): Document {
  const lines = markdown.split(/\r?\n/);
  const children: Paragraph[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const flushCode = () => {
    if (codeBuffer.length === 0) return;
    const codeText = codeBuffer.join('\n');
    children.push(
      new Paragraph({
        children: [new TextRun({ text: codeText, font: 'Consolas' })],
        spacing: { after: 120 }
      })
    );
    codeBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    // Code block fence
    if (/^```/.test(line)) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.trim() === '') {
      // blank line -> empty paragraph (visual break)
      children.push(new Paragraph({ children: [new TextRun('')] }));
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const headingLevel = level === 1
        ? HeadingLevel.HEADING_1
        : level === 2
          ? HeadingLevel.HEADING_2
          : level === 3
            ? HeadingLevel.HEADING_3
            : level === 4
              ? HeadingLevel.HEADING_4
              : level === 5
                ? HeadingLevel.HEADING_5
                : HeadingLevel.HEADING_6;
      children.push(
        new Paragraph({
          text,
          heading: headingLevel,
          spacing: { before: 200, after: 120 }
        })
      );
      continue;
    }

    // Bullet list
    const bulletMatch = /^[\-\*\+]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      children.push(
        new Paragraph({
          text: bulletMatch[1],
          bullet: { level: 0 }
        })
      );
      continue;
    }

    // Numbered list
    const numMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (numMatch) {
      children.push(
        new Paragraph({
          text: numMatch[1],
          numbering: { reference: 'default-numbering', level: 0 }
        })
      );
      continue;
    }

    // Block quote
    if (/^>\s?/.test(line)) {
      children.push(
        new Paragraph({
          text: line.replace(/^>\s?/, ''),
          indent: { left: 720 }
        })
      );
      continue;
    }

    // Default: plain paragraph. Strip simple inline markdown (**bold**, *italic*).
    const runs = parseInline(line);
    children.push(new Paragraph({ children: runs, spacing: { after: 100 } }));
  }

  flushCode();

  return new Document({
    creator: 'TB Step by Step',
    title: 'Final Combined Document',
    sections: [
      {
        properties: {},
        children
      }
    ]
  });
}

/**
 * Lightweight inline parser: **bold**, *italic*, `code`
 */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;
  let bold = false;
  let italic = false;
  let code = false;

  // Simple state machine over inline markers
  const tokenRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: remaining.slice(lastIndex, match.index) }));
    }
    if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3] !== undefined) {
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4] !== undefined) {
      runs.push(new TextRun({ text: match[4], font: 'Consolas' }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    runs.push(new TextRun({ text: remaining.slice(lastIndex) }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  // Silence unused variable warnings; flags reserved for future use
  void bold; void italic; void code;
  return runs;
}

export { Packer };
