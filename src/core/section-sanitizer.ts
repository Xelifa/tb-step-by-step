/**
 * Section content sanitizer and validator.
 *
 * Strips common AI-style meta phrases and pre/postamble that
 * should not appear in a formal bidding document section.
 */

export const FORBIDDEN_PHRASES: string[] = [
  '好的，我已经',
  '好的，我已',
  '我已收到',
  '我将',
  '作为您的',
  '现在，我将',
  '以下是',
  '以上是',
  '如需进一步',
  '希望这些内容',
  '请您确认'
];

/**
 * Strip forbidden AI-style phrases that commonly appear at
 * the start or end of LLM output. Returns cleaned text.
 *
 * The matching is intentionally conservative — we only remove
 * a line/paragraph that contains the phrase, not phrases that
 * might legitimately appear inside a quotation.
 */
export function sanitizeSectionContent(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;

  let cleaned = text;
  for (const phrase of FORBIDDEN_PHRASES) {
    // Remove lines that contain the phrase as a standalone segment.
    // This catches opening lines like "好的，我将..." and closing
    // lines like "如需进一步修改，请告知。".
    const linePattern = new RegExp(
      `^.*${escapeRegExp(phrase)}.*$`,
      'gm'
    );
    cleaned = cleaned.replace(linePattern, '');
  }

  // Collapse runs of empty lines into at most one blank line.
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace.
  return cleaned.trim();
}

export interface ValidationIssue {
  file: string;
  phrase: string;
  position: 'start' | 'end' | 'anywhere';
  excerpt: string;
}

export interface ValidationResult {
  ok: boolean;
  filesChecked: number;
  issues: ValidationIssue[];
}

/**
 * Validate a single section's text. Returns issues found.
 */
export function validateSectionText(
  filename: string,
  text: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof text !== 'string' || text.trim().length === 0) return issues;

  // Check the first non-empty line for opening AI chatter.
  const firstNonEmpty = (text.split(/\r?\n/).find(l => l.trim().length > 0) || '').trim();
  // Check the last non-empty line for closing AI chatter.
  const lastNonEmpty = (text.split(/\r?\n/).reverse().find(l => l.trim().length > 0) || '').trim();

  for (const phrase of FORBIDDEN_PHRASES) {
    if (firstNonEmpty.includes(phrase)) {
      issues.push({
        file: filename,
        phrase,
        position: 'start',
        excerpt: firstNonEmpty.slice(0, 80)
      });
    }
    if (lastNonEmpty.includes(phrase)) {
      issues.push({
        file: filename,
        phrase,
        position: 'end',
        excerpt: lastNonEmpty.slice(0, 80)
      });
    }
  }
  return issues;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
