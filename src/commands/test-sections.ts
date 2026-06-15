/**
 * Test: validate generated section .md files in output/sections/.
 *
 * Scans every .md file under output/sections/ and checks for
 * forbidden AI-style opening/ending phrases. Exits 0 if all
 * clean, 1 if any issues are found.
 */
import fs from 'fs';
import path from 'path';
import {
  validateSectionText,
  ValidationIssue,
  ValidationResult
} from '../core/section-sanitizer';

const projectRoot = process.cwd();
const sectionsDir = path.join(projectRoot, 'output', 'sections');

function listSectionFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.md') && f !== '.gitkeep')
    .sort();
}

function main(): void {
  const files = listSectionFiles(sectionsDir);
  if (files.length === 0) {
    console.log(`[test:sections] No section files found in ${sectionsDir}.`);
    console.log('[test:sections] Generate sections first (npm run step2:section).');
    process.exit(0);
  }

  const issues: ValidationIssue[] = [];
  for (const f of files) {
    const full = path.join(sectionsDir, f);
    const text = fs.readFileSync(full, 'utf8');
    issues.push(...validateSectionText(f, text));
  }

  const result: ValidationResult = {
    ok: issues.length === 0,
    filesChecked: files.length,
    issues
  };

  console.log(`[test:sections] Checked ${result.filesChecked} section file(s).`);
  if (result.ok) {
    console.log('[test:sections] OK — no forbidden AI-style phrases detected.');
    process.exit(0);
  }

  console.error(`[test:sections] FAIL — found ${result.issues.length} issue(s):`);
  for (const issue of result.issues) {
    console.error(`  - ${issue.file} [${issue.position}]: "${issue.phrase}"`);
    console.error(`      excerpt: ${issue.excerpt}…`);
  }
  process.exit(1);
}

main();
