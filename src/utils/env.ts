import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileExists } from './file';

// Load .env file if it exists
export async function loadEnvFile(): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');
  if (await fileExists(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Get environment variable or throw
export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

// Check if environment variable exists
export function hasEnvVar(key: string): boolean {
  return !!process.env[key];
}

// Format value for .env file (safe quoting)
function formatEnvValue(value: string): string {
  // Reject newlines
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('Environment variable value cannot contain newline characters');
  }

  // If value contains special characters, quote it
  const needsQuoting = /[\s#=]/.test(value);
  if (needsQuoting) {
    // Escape double quotes and wrap in quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
}

// Upsert environment variable in .env file
export async function upsertEnvVar(
  key: string,
  value: string
): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');

  // Format value safely
  const formattedValue = formatEnvValue(value);

  let content = '';
  if (await fileExists(envPath)) {
    content = await fs.readFile(envPath, 'utf-8');
  }

  const lines = content.split('\n').filter(line => line.trim() !== '');
  const keyPattern = new RegExp(`^${key}=`);
  const existingIndex = lines.findIndex(line => keyPattern.test(line));

  const newLine = `${key}=${formattedValue}`;

  if (existingIndex >= 0) {
    // Update existing key
    lines[existingIndex] = newLine;
  } else {
    // Add new key
    lines.push(newLine);
  }

  await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
}
