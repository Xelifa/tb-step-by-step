import mammoth from 'mammoth';
import { logger } from './logger';

/**
 * Extract text content from a DOCX file
 * @param filePath Absolute path to the .docx file
 * @returns Extracted text content
 */
export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;

    if (!text || text.trim().length === 0) {
      throw new Error('DOCX file contains no readable text');
    }

    logger.success(`Extracted ${text.length} characters from DOCX`);
    return text;
  } catch (error) {
    logger.error(`Failed to parse DOCX file: ${filePath}`);
    throw new Error(
      `DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
