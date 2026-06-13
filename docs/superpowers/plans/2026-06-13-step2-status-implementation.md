# Step 2 Section Status Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement npm run step2:status command that shows section completion progress and consistency status.

**Architecture:** Command entry point (step2-status.ts) delegates to core runner (step2-status-runner.ts) which orchestrates: prerequisite verification → outline parsing → state comparison → file system check → status report generation → snapshot logging.

**Tech Stack:** TypeScript, fs operations, existing state management, existing file utilities.

---

## File Structure

**New files:**
- `src/types/step2-status.ts` - Type definitions for status result
- `src/core/step2-status-runner.ts` - Core status check logic
- `src/commands/step2-status.ts` - npm run step2:status command entry point

**Modified files:**
- `package.json` - Add step2:status script

---

## Task 1: Add Step 2 Status Type Definitions

**Files:**
- Create: `src/types/step2-status.ts`

- [ ] **Step 1: Create Step 2 status type definitions**

Create `src/types/step2-status.ts`:

```typescript
export interface SectionStatus {
  title: string;
  output_filename: string;
  completed: boolean;
  file_exists: boolean;
}

export interface Step2StatusRunResult {
  success: boolean;
  checked_at: string;
  total_sections: number;
  completed_count: number;
  remaining_count: number;
  current_section: string;
  completed_sections: string[];
  remaining_sections: string[];
  generated_files: string[];
  warnings: string[];
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
cd "/Users/admin/tb step by step" && git add src/types/step2-status.ts && git commit -m "feat: add Step 2 status type definitions"
```

---

## Task 2: Core Step 2 Status Runner - Part 1: Prerequisites and File Reading

**Files:**
- Create: `src/core/step2-status-runner.ts`

- [ ] **Step 1: Create Step 2 status runner skeleton**

Create `src/core/step2-status-runner.ts`:

```typescript
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile } from '../utils/file';
import { loadEnvFile } from '../utils/env';
import { isModelGatePassed } from './state-manager';
import { Step2StatusRunResult, SectionStatus } from '../types/step2-status';
import { Outline } from '../types/step2';
import fs from 'fs';
import path from 'path';

/**
 * Verify Step 2 outline has been confirmed
 */
async function verifyStep2OutlineConfirmed(): Promise<void> {
  logger.section('Verifying Step 2 Outline Confirmation');
  
  const state = await readJSONFile<{
    step2_confirmed: boolean;
    outline_confirmed: boolean;
  }>('logs/workflow-state.json');
  
  if (!state || !state.step2_confirmed || !state.outline_confirmed) {
    throw new Error('Step 2 outline has not been confirmed. Please run: npm run step2:confirm');
  }
  
  logger.success('Step 2 outline confirmation verified ✓');
}

/**
 * Read required files for status check
 */
async function readStatusCheckFiles(): Promise<{
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
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit Part 1**

```bash
cd "/Users/admin/tb step by step" && git add src/core/step2-status-runner.ts && git commit -m "feat: add Step 2 status runner Part 1 - prerequisites and file reading"
```

---

## Task 3: Core Step 2 Status Runner - Part 2: Status Analysis and Report

**Files:**
- Modify: `src/core/step2-status-runner.ts`

- [ ] **Step 1: Add status analysis and reporting functions**

Add to `src/core/step2-status-runner.ts` after file reading function:

```typescript
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
 * Analyze section completion status
 */
function analyzeSectionStatus(
  outline: Outline,
  completedFilenames: string[],
  generatedFiles: string[]
): {
  sections: SectionStatus[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const sections: SectionStatus[] = [];
  
  for (const section of outline.sections) {
    const filename = section.output_filename;
    const isCompleted = completedFilenames.includes(filename);
    const fileExists = generatedFiles.includes(filename);
    
    // Check for inconsistencies
    if (isCompleted && !fileExists) {
      warnings.push(`Section "${section.title}" marked completed but file missing: ${filename}`);
    }
    
    if (!isCompleted && fileExists) {
      warnings.push(`Section "${section.title}" file exists but not recorded in completed_sections: ${filename}`);
    }
    
    // Check for missing or unsafe filename
    if (!filename || filename.trim() === '') {
      warnings.push(`Section "${section.title}" has missing or empty output_filename`);
    }
    
    sections.push({
      title: section.title,
      output_filename: filename,
      completed: isCompleted,
      file_exists: fileExists
    });
  }
  
  return { sections, warnings };
}

/**
 * Display status report
 */
function displayStatusReport(
  totalSections: number,
  completedCount: number,
  remainingCount: number,
  currentSection: string,
  completedSections: string[],
  remainingSections: string[],
  generatedFiles: string[],
  warnings: string[]
): void {
  logger.section('Section Status Report');
  logger.info('');
  
  // Summary
  logger.info('Summary:');
  logger.info(`  Total sections:    ${totalSections}`);
  logger.info(`  Completed:         ${completedCount}`);
  logger.info(`  Remaining:         ${remainingCount}`);
  
  if (currentSection) {
    logger.info(`  Currently writing: ${currentSection}`);
  }
  logger.info('');
  
  // Completed sections
  if (completedSections.length > 0) {
    logger.success('Completed sections:');
    for (const section of completedSections) {
      logger.success(`  ✓ ${section}`);
    }
    logger.info('');
  }
  
  // Remaining sections
  if (remainingSections.length > 0) {
    logger.warn('Remaining sections:');
    for (const section of remainingSections) {
      logger.warn(`  ○ ${section}`);
    }
    logger.info('');
  }
  
  // Generated files
  if (generatedFiles.length > 0) {
    logger.info('Generated files in output/sections/:');
    for (const file of generatedFiles) {
      logger.info(`  ${file}`);
    }
    logger.info('');
  }
  
  // Warnings
  if (warnings.length > 0) {
    logger.error('Consistency warnings:');
    for (const warning of warnings) {
      logger.error(`  ⚠ ${warning}`);
    }
    logger.info('');
  }
  
  // Next steps
  logger.info('Next steps:');
  if (remainingCount > 0) {
    logger.info('  • Run: npm run step2:section');
  } else {
    logger.info('  • All sections completed. Final combination is not implemented yet.');
  }
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
cd "/Users/admin/tb step by step" && git add src/core/step2-status-runner.ts && git commit -m "feat: add Step 2 status runner Part 2 - analysis and reporting"
```

---

## Task 4: Core Step 2 Status Runner - Part 3: Main Runner Function

**Files:**
- Modify: `src/core/step2-status-runner.ts`

- [ ] **Step 1: Add main runStep2Status function**

Add to `src/core/step2-status-runner.ts` after display functions:

```typescript
/**
 * Main Step 2 status runner
 */
export async function runStep2Status(): Promise<Step2StatusRunResult> {
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
    await verifyStep2OutlineConfirmed();

    // Step 5: Read files
    const { workflowState, outline } = await readStatusCheckFiles();
    
    // Step 6: Get generated files
    const generatedFiles = getGeneratedSectionFiles();
    
    // Step 7: Analyze status
    const { sections, warnings } = analyzeSectionStatus(
      outline,
      workflowState.completed_sections,
      generatedFiles
    );
    
    // Step 8: Calculate counts
    const totalSections = sections.length;
    const completedSections = sections.filter(s => s.completed).map(s => s.title);
    const remainingSections = sections.filter(s => !s.completed).map(s => s.title);
    const completedCount = completedSections.length;
    const remainingCount = remainingSections.length;
    const currentSection = workflowState.current_section || '';
    
    // Step 9: Display report
    displayStatusReport(
      totalSections,
      completedCount,
      remainingCount,
      currentSection,
      completedSections,
      remainingSections,
      generatedFiles,
      warnings
    );
    
    // Step 10: Create run log
    const result: Step2StatusRunResult = {
      success: true,
      checked_at: new Date().toISOString(),
      total_sections: totalSections,
      completed_count: completedCount,
      remaining_count: remainingCount,
      current_section: currentSection,
      completed_sections: completedSections,
      remaining_sections: remainingSections,
      generated_files: generatedFiles,
      warnings,
      mock_used: false
    };

    await writeJSONFile('logs/step2-status-run.json', result);
    logger.success('Saved logs/step2-status-run.json');

    return result;

  } catch (error) {
    logger.error('Step 2 status check failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const result: Step2StatusRunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      total_sections: 0,
      completed_count: 0,
      remaining_count: 0,
      current_section: '',
      completed_sections: [],
      remaining_sections: [],
      generated_files: [],
      warnings: [],
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step2-status-run.json', result);
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

- [ ] **Step 3: Commit Part 3**

```bash
cd "/Users/admin/tb step by step" && git add src/core/step2-status-runner.ts && git commit -m "feat: add Step 2 status runner Part 3 - main runner function"
```

---

## Task 5: Step 2 Status Command Entry Point

**Files:**
- Create: `src/commands/step2-status.ts`
- Modify: `package.json`

- [ ] **Step 1: Create Step 2 status command entry point**

Create `src/commands/step2-status.ts`:

```typescript
import { logger } from '../utils/logger';
import { runStep2Status } from '../core/step2-status-runner';

async function step2StatusCommand() {
  try {
    logger.section('Step 2: Section Status Check');

    await runStep2Status();

  } catch (error) {
    logger.error('Step 2 status check failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step2StatusCommand();
```

- [ ] **Step 2: Add npm script**

Read `package.json` and add these two lines to the scripts section after the `step2:section` lines:

```json
"step2:status": "node dist/commands/step2-status.js",
"prestep2:status": "npm run build",
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

Expected: Output includes `step2:status`

- [ ] **Step 5: Commit Step 2 status command**

```bash
cd "/Users/admin/tb step by step" && git add src/commands/step2-status.ts package.json && git commit -m "feat: add npm run step2:status command entry point"
```

---

## Task 6: Final Verification

**Files:**
- No new files

- [ ] **Step 1: Verify final build**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds with no errors

- [ ] **Step 2: Verify read-only behavior**

Run:
```bash
cd "/Users/admin/tb step by step" && grep -R "callAPI\|writeTextFile.*sections\|markSection" src/core/step2-status-runner.ts
```

Expected: No LLM calls or modifications to section files/workflow state (only writeJSONFile for status log)

- [ ] **Step 3: Verify command structure**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run
```

Expected: Lists all scripts including `step2:status`

- [ ] **Step 4: Final commit**

```bash
cd "/Users/admin/tb step by step" && git add -A && git commit -m "feat: complete Step 2 section status check workflow"
```

- [ ] **Step 5: Manual testing instructions**

User should:
1. Ensure Step 2 outline has been confirmed
2. Run: `npm run step2:status`
3. Verify status report shows:
   - Total/completed/remaining counts
   - Completed sections list
   - Remaining sections list
   - Generated files list
   - Any consistency warnings
4. Check `logs/step2-status-run.json` for complete snapshot
5. Verify no modifications to workflow state or section files

---

## Scope Verification

**Implemented requirements:**
✅ Add `npm run step2:status` command
✅ Verify model gate, Step 1, Step 2 outline, Step 2 confirmation
✅ Read workflow state and outline
✅ Parse all sections from outline
✅ Compare completed_sections vs actual files
✅ Display total/completed/remaining counts
✅ List completed and remaining sections
✅ Show generated files
✅ Report consistency warnings
✅ Suggest next command
✅ Save status snapshot to logs/step2-status-run.json
✅ Read-only - no LLM calls
✅ No modifications except status log

**NOT implemented (as requested):**
- Final document combination
- Step 3 full rolling execution
- Section content generation
- Automatic state repair

**Quality checks:**
- All code includes complete implementations
- TypeScript strict mode enabled
- Literal type `mock_used: false` enforces no-mock policy
- Read-only behavior enforced
- Clear status reporting
- Comprehensive consistency checks
