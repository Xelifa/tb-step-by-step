import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from './logger';

// Ensure directory exists, create if needed
export async function ensureDirectoryExists(
  dirPath: string
): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory already exists is okay
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

// Read JSON file safely
export async function readJSONFile<T>(
  filePath: string
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // File not found - return null
      return null;
    }
    // Invalid JSON - log warning and throw
    logger.warn(`Invalid JSON in ${filePath}: ${error}`);
    throw new Error(`Invalid JSON in ${filePath}`);
  }
}

// Write JSON file with formatting
export async function writeJSONFile<T>(
  filePath: string,
  data: T
): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Check if file exists
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Read text file
export async function readTextFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

// Write text file
export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}
