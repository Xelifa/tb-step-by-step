# Final Combination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement npm run final:combine command that combines generated section files into final-combined.md without LLM calls or content modification.

**Architecture:** Command entry point (final-combine.ts) delegates to core runner (final-combine-runner.ts) which verifies prerequisites → reads outline and workflow state → checks section completion → prompts user if sections missing → combines sections in outline order → saves final document → updates workflow state.

**Tech Stack:** TypeScript, inquirer for user prompts, fs operations, existing state management.

---

## File Structure

**New files:**
- `src/types/final-combine.ts` - Type definitions for combine result
- `src/core/final-combine-runner.ts` - Core combination logic
- `src/commands/final-combine.ts` - npm run final:combine command entry point

**Modified files:**
- `src/core/state-manager.ts` - Add markFinalCombined function
- `package.json` - Add final:combine script

---

## Task 1: Add Final Combine Type Definitions

**Files:**
- Create: `src/types/final-combine.ts`

- [ ] **Step 1: Create final combine type definitions**

Create `src/types/final-combine.ts`:

```typescript
export interface FinalCombineRunResult {
  success: boolean;
  checked_at: string;
  total_sections: number;
  combined_count: number;
  missing_count: number;
  missing_sections: string[];
  partial: boolean;
  output_file: string;
  mock_used: false;  // Literal type - always false
  error?: string;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds with no errors

- [ ] **Step 3: Commit type definitions**

```bash
cd "/Users/admin/tb step by step" && git add src/types/final-combine.ts && git commit -m "feat: add final combine type definitions"
```

---

## Task 2: State Manager Updates for Final Combination

**Files:**
- Modify: `src/core/state-manager.ts`

- [ ] **Step 1: Add final combination state update function**

Read `src/core/state-manager.ts`, then add this function after existing mark functions:

```typescript
export async function markFinalCombined(): Promise<void> {
  const state = await loadWorkflowState();
  state.final_combined = true;
  await writeJSONFile(WORKFLOW_STATE_FILE, state);
  logger.success('Final document combined');
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit state manager updates**

```bash
cd "/Users/admin/tb step by step" && git add src/core/state-manager.ts && git commit -m "feat: add final combination state update function"
```

---

## Task 3: Core Final Combine Runner - Part 1: Prerequisites and File Reading

**Files:**
- Create: `src/core/final-combine-runner.ts`

- [ ] **Step 1: Create final combine runner skeleton**

Create `src/core/final-combine-runner.ts`:

```typescript
import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile } from '../utils/env';
import { isModelGatePassed } from './state-manager';
import { FinalCombineRunResult } from '../types/final-combine';
import { Outline } from '../types/step2';
import fs from 'fs';
import path from 'path';

/**
 * Read required files for final combination
 */
async function readCombineInputFiles(): Promise<{
  workflowState: {
    completed_sections: string[];
    current_section: string;
  };
  outline: Outline;
}> {
  // Read workflow state
  const workflowState = await readJSONFile<{
    completed_sections: string[];
    current_section: string;
  }>('logs/workflow-state.json');
  
  if (!workflowState) {
    throw new Error('logs/workflow-state.json not found');
  }
  
  // Read outline from step2-outline-run.json
  const outlineRunLog = await readJSONFile<{
    success: boolean;
    outline: Outline;
  }>('logs/step2-outline-run.json');
  
  if (!outlineRunLog || !outlineRunLog.success) {
    throw new Error('logs/step2-outline-run.json not found or unsuccessful');
  }
  
  if (!outlineRunLog.outline) {
    throw new Error('logs/step2-outline-run.json missing outline structure');
  }
  
  return {
    workflowState,
    outline: outlineRunLog.outline
  };
}

/**
 * Get list of generated section files
 */
function getGeneratedSectionFiles(): string[] {
  const sectionsDir = 'output/sections';
  
  if (!fs.existsSync(sectionsDir)) {
    return [];
  }
  
  const files = fs.readdirSync(sectionsDir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep');
  
  return files;
}

/**
 * Read section file content
 */
function readSectionFile(filename: string): string {
  const filePath = path.join('output/sections', filename);
  
  if (!fs.existsSync(filePath)) {
    return '';
  }
  
  return fs.readFileSync(filePath, 'utf-8');
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit Part 1**

```bash
cd "/Users/admin/tb step by step" && git add src/core/final-combine-runner.ts && git commit -m "feat: add final combine runner Part 1 - prerequisites and file reading"
```

---

## Task 4: Core Final Combine Runner - Part 2: Section Analysis and User Prompt

**Files:**
- Modify: `src/core/final-combine-runner.ts`

- [ ] **Step 1: Add section analysis and user prompt functions**

Add to `src/core/final-combine-runner.ts` after file reading functions:

```typescript
/**
 * Check section completion status
 */
function checkSectionCompletion(
  outline: Outline,
  generatedFiles: string[]
): {
  missingSections: string[];
  missingFilenames: string[];
  allComplete: boolean;
} {
  const missingSections: string[] = [];
  const missingFilenames: string[] = [];
  
  for (const section of outline.sections) {
    const filename = section.output_filename;
    if (!generatedFiles.includes(filename)) {
      missingSections.push(section.title);
      missingFilenames.push(filename);
    }
  }
  
  return {
    missingSections,
    missingFilenames,
    allComplete: missingSections.length === 0
  };
}

/**
 * Prompt user for partial combination confirmation
 */
async function promptPartialCombine(missingSections: string[]): Promise<boolean> {
  logger.warn('');
  logger.warn('Missing sections detected:');
  for (const section of missingSections) {
    logger.warn(`  • ${section}`);
  }
  logger.warn('');
  
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([{
    type: 'confirm',
    name: 'proceed',
    message: 'Some sections are missing. Combine only completed sections?',
    default: false
  }]);
  
  return proceed;
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit Part 2**

```bash
cd "/Users/admin/tb step by step" && git add src/core/final-combine-runner.ts && git commit -m "feat: add final combine runner Part 2 - section analysis and user prompt"
```

---

## Task 5: Core Final Combine Runner - Part 3: Document Generation

**Files:**
- Modify: `src/core/final-combine-runner.ts`

- [ ] **Step 1: Add document generation function**

Add to `src/core/final-combine-runner.ts` after user prompt functions:

```typescript
/**
 * Generate table of contents from outline
 */
function generateTableOfContents(outline: Outline): string {
  let toc = '## 目录\n\n';
  
  for (const section of outline.sections) {
    const indent = '  '.repeat(section.level - 1);
    const prefix = section.level === 1 ? '- ' : '  - ';
    toc += `${indent}${prefix}${section.title}\n`;
  }
  
  return toc;
}

/**
 * Combine sections into final document
 */
function combineSections(
  outline: Outline,
  generatedFiles: string[],
  partial: boolean
): string {
  let content = '';
  
  for (const section of outline.sections) {
    const filename = section.output_filename;
    const hasFile = generatedFiles.includes(filename);
    
    if (hasFile) {
      // Read and append section content
      const sectionContent = readSectionFile(filename);
      content += sectionContent + '\n\n';
    } else if (partial) {
      // Add placeholder for missing section
      content += `## ${section.title}\n\n`;
      content += `[未生成：该章节尚未通过 npm run step2:section 生成]\n\n`;
    }
  }
  
  return content;
}

/**
 * Generate final combined document
 */
function generateFinalDocument(
  outline: Outline,
  generatedFiles: string[],
  combinedCount: number,
  totalCount: number,
  partial: boolean
): string {
  const timestamp = new Date().toISOString();
  
  let document = '';
  
  // Document title
  document += `# ${outline.document_title}\n\n`;
  
  // Generation metadata
  document += `**生成时间:** ${timestamp}\n\n`;
  document += `**组合状态:** ${partial ? '部分组合' : '完整组合'} (${combinedCount}/${totalCount} 章节)\n\n`;
  
  // Table of contents
  document += generateTableOfContents(outline) + '\n\n';
  
  // Divider
  document += '---\n\n';
  
  // Combined sections
  document += combineSections(outline, generatedFiles, partial);
  
  return document;
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit Part 3**

```bash
cd "/Users/admin/tb step by step" && git add src/core/final-combine-runner.ts && git commit -m "feat: add final combine runner Part 3 - document generation"
```

---

## Task 6: Core Final Combine Runner - Part 4: Main Runner Function

**Files:**
- Modify: `src/core/final-combine-runner.ts`

- [ ] **Step 1: Add main runFinalCombine function**

Add to `src/core/final-combine-runner.ts` after document generation functions:

```typescript
/**
 * Main final combine runner
 */
export async function runFinalCombine(): Promise<FinalCombineRunResult> {
  try {
    // Load environment
    await loadEnvFile();

    // Step 1: Verify model gate passed
    logger.section('Verifying Model Gate');
    const gatePassed = await isModelGatePassed();
    
    if (!gatePassed) {
      throw new Error('Model gate has not passed. Please run: npm run config');
    }
    logger.success('Model gate verified ✓');

    // Step 2: Verify Step 1 completed
    logger.section('Verifying Step 1 Completion');
    const step1State = await readJSONFile<{ new_prompt_generated: boolean }>('logs/workflow-state.json');
    if (!step1State || !step1State.new_prompt_generated) {
      throw new Error('Step 1 has not completed. Please run: npm run step1');
    }
    logger.success('Step 1 completion verified ✓');

    // Step 3: Verify Step 2 outline generated
    logger.section('Verifying Step 2 Outline Generation');
    const step2State = await readJSONFile<{ outline_generated: boolean }>('logs/workflow-state.json');
    if (!step2State || !step2State.outline_generated) {
      throw new Error('Step 2 outline has not been generated. Please run: npm run step2:outline');
    }
    logger.success('Step 2 outline generation verified ✓');

    // Step 4: Verify Step 2 outline confirmed
    logger.section('Verifying Step 2 Outline Confirmation');
    const confirmState = await readJSONFile<{ outline_confirmed: boolean }>('logs/workflow-state.json');
    if (!confirmState || !confirmState.outline_confirmed) {
      throw new Error('Step 2 outline has not been confirmed. Please run: npm run step2:confirm');
    }
    logger.success('Step 2 outline confirmation verified ✓');

    // Step 5: Read input files
    logger.section('Reading Input Files');
    const { workflowState, outline } = await readCombineInputFiles();
    logger.success('Input files loaded ✓');

    // Step 6: Get generated section files
    logger.section('Checking Generated Sections');
    const generatedFiles = getGeneratedSectionFiles();
    logger.info(`Found ${generatedFiles.length} generated section files`);
    
    // Step 7: Check section completion
    const { missingSections, missingFilenames, allComplete } = checkSectionCompletion(outline, generatedFiles);
    
    const totalSections = outline.sections.length;
    const combinedCount = totalSections - missingSections.length;
    const missingCount = missingSections.length;
    
    let partial = false;
    
    // Step 8: Handle missing sections
    if (!allComplete) {
      const proceed = await promptPartialCombine(missingSections);
      
      if (!proceed) {
        // User chose not to continue
        logger.info('');
        logger.info('Final combination cancelled.');
        logger.info('Please generate missing sections first: npm run step2:section');
        
        const result: FinalCombineRunResult = {
          success: true,
          checked_at: new Date().toISOString(),
          total_sections: totalSections,
          combined_count: 0,
          missing_count: missingCount,
          missing_sections: missingSections,
          partial: false,
          output_file: '',
          mock_used: false
        };
        
        await writeJSONFile('logs/final-combine-run.json', result);
        logger.success('Saved logs/final-combine-run.json');
        
        return result;
      }
      
      partial = true;
    }
    
    // Step 9: Generate final document
    logger.section('Generating Final Document');
    const finalDocument = generateFinalDocument(outline, generatedFiles, combinedCount, totalSections, partial);
    
    // Step 10: Save final document
    await writeTextFile('output/final-combined.md', finalDocument);
    logger.success('Saved output/final-combined.md');
    
    // Step 11: Create run log
    const result: FinalCombineRunResult = {
      success: true,
      checked_at: new Date().toISOString(),
      total_sections: totalSections,
      combined_count: combinedCount,
      missing_count: missingCount,
      missing_sections: missingSections,
      partial,
      output_file: 'output/final-combined.md',
      mock_used: false
    };

    await writeJSONFile('logs/final-combine-run.json', result);
    logger.success('Saved logs/final-combine-run.json');

    // Step 12: Update workflow state
    const { markFinalCombined } = await import('./state-manager');
    await markFinalCombined();

    logger.section('Final Combination Completed');
    logger.info('');
    logger.success(`Final document generated successfully ✓`);
    logger.info(`  Total sections: ${totalSections}`);
    logger.info(`  Combined: ${combinedCount}`);
    if (partial) {
      logger.warn(`  Missing: ${missingCount} (placeholders added)`);
    }
    logger.info('');
    logger.info(`Output: output/final-combined.md`);

    return result;

  } catch (error) {
    logger.error('Final combination failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const result: FinalCombineRunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      total_sections: 0,
      combined_count: 0,
      missing_count: 0,
      missing_sections: [],
      partial: false,
      output_file: '',
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/final-combine-run.json', result);
    throw error;
  }
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit Part 4**

```bash
cd "/Users/admin/tb step by step" && git add src/core/final-combine-runner.ts && git commit -m "feat: add final combine runner Part 4 - main runner function"
```

---

## Task 7: Final Combine Command Entry Point

**Files:**
- Create: `src/commands/final-combine.ts`
- Modify: `package.json`

- [ ] **Step 1: Create final combine command entry point**

Create `src/commands/final-combine.ts`:

```typescript
import { logger } from '../utils/logger';
import { runFinalCombine } from '../core/final-combine-runner';

async function finalCombineCommand() {
  try {
    logger.section('Final Document Combination');

    await runFinalCombine();

  } catch (error) {
    logger.error('Final combination failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

finalCombineCommand();
```

- [ ] **Step 2: Add npm script**

Read `package.json` and add these two lines to the scripts section after the `step2:status` lines:

```json
"final:combine": "node dist/commands/final-combine.js",
"prefinal:combine": "npm run build",
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 4: Verify command is available**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run
```

Expected: Output includes `final:combine`

- [ ] **Step 5: Commit final combine command**

```bash
cd "/Users/admin/tb step by step" && git add src/commands/final-combine.ts package.json && git commit -m "feat: add npm run final:combine command entry point"
```

---

## Task 8: Final Verification

**Files:**
- No new files

- [ ] **Step 1: Verify final build**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds with no errors

- [ ] **Step 2: Verify no-LLM behavior**

Run:
```bash
cd "/Users/admin/tb step by step" && grep -R "callAPI" src/core/final-combine-runner.ts src/commands/final-combine.ts
```

Expected: No LLM API calls found

- [ ] **Step 3: Verify read-only behavior**

Run:
```bash
cd "/Users/admin/tb step by step" && grep -R "markSection\|writeTextFile.*sections" src/core/final-combine-runner.ts
```

Expected: No section file modifications or workflow state modifications (except markFinalCombined and final-combined.md)

- [ ] **Step 4: Verify command structure**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run
```

Expected: Lists all scripts including `final:combine`

- [ ] **Step 5: Final commit**

```bash
cd "/Users/admin/tb step by step" && git add -A && git commit -m "feat: complete final combination workflow"
```

- [ ] **Step 6: Manual testing instructions**

User should:
1. Ensure all sections are generated (or some sections generated)
2. Run: `npm run final:combine`
3. If missing sections, verify prompt appears
4. If user chooses No, verify combination cancelled
5. If user chooses Yes, verify partial combination
6. Check `output/final-combined.md` structure
7. Check `logs/final-combine-run.json` for correct metadata
8. Verify `workflow-state.json` updated with `final_combined: true`

---

## Scope Verification

**Implemented requirements:**
✅ Add `npm run final:combine` command
✅ Verify model gate, Step 1, Step 2 outline, Step 2 confirmation
✅ Read workflow state, outline, and section files
✅ Parse section order from outline
✅ Check section completion status
✅ Prompt user if sections missing (default No)
✅ Exit cleanly if user chooses No
✅ Combine sections in outline order if user chooses Yes
✅ Preserve section content exactly (no rewrite)
✅ Add placeholders for missing sections if partial combine
✅ Save to output/final-combined.md
✅ Save run log to logs/final-combine-run.json
✅ Update workflow state with final_combined: true
✅ No LLM calls
✅ No content generation or modification

**NOT implemented (as requested):**
- Step 3 full rolling execution
- Missing section generation
- Section content rewriting or polishing

**Quality checks:**
- All code includes complete implementations
- TypeScript strict mode enabled
- Literal type `mock_used: false` enforces no-mock policy
- Read-only behavior enforced (no section modifications)
- Clear status reporting
- User confirmation for partial combination
- Comprehensive logging
