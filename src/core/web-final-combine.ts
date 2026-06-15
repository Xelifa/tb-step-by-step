import { readJSONFile, readTextFile, writeTextFile, writeJSONFile } from '../utils/file';
import { logger } from '../utils/logger';
import { Outline } from '../types/step2';
import fs from 'fs';
import path from 'path';

export interface FinalCombineResult {
  success: boolean;
  output_file: string;
  total_sections: number;
  combined_sections: number;
  missing_sections: string[];
  checked_at: string;
  error?: string;
}

/**
 * Get ordered list of all sections from outline (preserving order)
 */
function getOrderedSections(outline: Outline): { title: string; level: number; output_filename: string }[] {
  return outline.sections.map(s => ({
    title: s.title,
    level: s.level,
    output_filename: s.output_filename
  }));
}

/**
 * Build the final-combined.md content in outline order.
 * Inserts a placeholder block for any missing section.
 */
function buildCombinedDocument(
  orderedSections: { title: string; level: number; output_filename: string }[],
  presentFiles: Set<string>,
  sectionsDir: string
): { content: string; combined: number; missing: string[] } {
  const parts: string[] = [];
  const missing: string[] = [];
  let combined = 0;

  parts.push('# 投标文件正文（合并版）');
  parts.push('');
  parts.push(`> 自动生成于 ${new Date().toISOString()}`);
  parts.push('');

  for (const section of orderedSections) {
    const headingPrefix = '#'.repeat(Math.max(1, Math.min(6, section.level + 1)));
    parts.push(`${headingPrefix} ${section.title}`);
    parts.push('');

    if (presentFiles.has(section.output_filename)) {
      const filePath = path.join(sectionsDir, section.output_filename);
      try {
        const body = fs.readFileSync(filePath, 'utf8').trim();
        parts.push(body);
        combined++;
      } catch (error) {
        parts.push(`[需补充：章节文件读取失败 - ${section.output_filename}]`);
        missing.push(section.output_filename);
      }
    } else {
      parts.push(`[需补充：章节正文未生成 - ${section.title}]`);
      missing.push(section.output_filename);
    }
    parts.push('');
  }

  return {
    content: parts.join('\n'),
    combined,
    missing
  };
}

/**
 * Web final combine: merges generated section files in outline order.
 * Does NOT call LLM, does NOT execute shell commands.
 */
export async function webFinalCombine(): Promise<FinalCombineResult> {
  const checkedAt = new Date().toISOString();

  try {
    // Read outline
    const outlineRunLog = await readJSONFile<{ success: boolean; outline: Outline }>(
      'logs/step2-outline-run.json'
    );
    if (!outlineRunLog || !outlineRunLog.success || !outlineRunLog.outline) {
      throw new Error('Outline not found. Please generate outline first.');
    }

    // Verify outline confirmed
    const workflowState = await readJSONFile<{
      step2_confirmed: boolean;
      outline_confirmed: boolean;
    }>('logs/workflow-state.json');
    if (!workflowState?.step2_confirmed || !workflowState?.outline_confirmed) {
      throw new Error('Outline has not been confirmed. Please confirm outline first.');
    }

    const sectionsDir = 'output/sections';
    if (!fs.existsSync(sectionsDir)) {
      throw new Error('No sections directory found.');
    }

    // Get all section files currently on disk
    const presentFiles = new Set(
      fs.readdirSync(sectionsDir).filter(f => f.endsWith('.md'))
    );

    if (presentFiles.size === 0) {
      throw new Error('No section files found. Generate at least one section first.');
    }

    // Build ordered list from outline
    const ordered = getOrderedSections(outlineRunLog.outline);
    if (ordered.length === 0) {
      throw new Error('Outline has no sections.');
    }

    // Build combined content
    const { content, combined, missing } = buildCombinedDocument(ordered, presentFiles, sectionsDir);

    // Write final-combined.md
    const outputFile = 'output/final-combined.md';
    await writeTextFile(outputFile, content);

    // Write run log
    const result: FinalCombineResult = {
      success: true,
      output_file: outputFile,
      total_sections: ordered.length,
      combined_sections: combined,
      missing_sections: missing,
      checked_at: checkedAt
    };

    await writeJSONFile('logs/final-combine-run.json', result);
    logger.success(`Final combine completed: ${combined}/${ordered.length} sections`);

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Final combine failed: ${errorMsg}`);

    const result: FinalCombineResult = {
      success: false,
      output_file: '',
      total_sections: 0,
      combined_sections: 0,
      missing_sections: [],
      checked_at: checkedAt,
      error: errorMsg
    };

    await writeJSONFile('logs/final-combine-run.json', result);
    return result;
  }
}
