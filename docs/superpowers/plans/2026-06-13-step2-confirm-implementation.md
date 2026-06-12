# Step 2 Outline Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement npm run step2:confirm command that asks user to confirm they have reviewed and approved output/outline.md, with interactive yes/no prompt.

**Architecture:** Command entry point (step2-confirm.ts) delegates to core runner (step2-confirm-runner.ts) which verifies prerequisites → displays outline info → prompts user via inquirer → updates workflow state and saves log based on user response.

**Tech Stack:** TypeScript, inquirer@8.2.6 (existing), fs operations, existing state management.

---

## File Structure

**New files:**
- `src/types/step2-confirm.ts` - Type definitions for confirmation result
- `src/core/step2-confirm-runner.ts` - Core confirmation logic
- `src/commands/step2-confirm.ts` - npm run step2:confirm command entry point

**Modified files:**
- `src/core/state-manager.ts` - Add markStep2OutlineConfirmed function
- `package.json` - Add step2:confirm script

---

## Task 1: Add Step 2 Confirm Type Definitions

**Files:**
- Create: `src/types/step2-confirm.ts`

- [ ] **Step 1: Create Step 2 confirm type definitions**

Create `src/types/step2-confirm.ts`:

```typescript
export interface Step2ConfirmRunResult {
  success: boolean;
  confirmed: boolean;
  checked_at: string;
  outline_file: string;
  mock_used: false;  // Literal type - always false
  error?: string;
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit type definitions**

```bash
cd "/Users/admin/tb step by step" && git add src/types/step2-confirm.ts && git commit -m "feat: add Step 2 confirm type definitions"
```

---

## Task 2: State Manager Updates for Step 2 Confirmation

**Files:**
- Modify: `src/core/state-manager.ts`

- [ ] **Step 1: Add Step 2 confirmation state update function**

Read `src/core/state-manager.ts`, then add this function after `markStep2OutlineGenerated`:

```typescript
export async function markStep2OutlineConfirmed(): Promise<void> {
  const state = await loadWorkflowState();
  state.step2_confirmed = true;
  state.outline_confirmed = true;
  state.current_section = "";
  state.completed_sections = [];
  state.final_combined = false;
  await writeJSONFile(WORKFLOW_STATE_FILE, state);
  logger.success('Step 2 outline confirmed');
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
cd "/Users/admin/tb step by step" && git add src/core/state-manager.ts && git commit -m "feat: add Step 2 outline confirmation state function"
```

---

## Task 3: Core Step 2 Confirm Runner

**Files:**
- Create: `src/core/step2-confirm-runner.ts`

- [ ] **Step 1: Create Step 2 confirm runner**

Create `src/core/step2-confirm-runner.ts`:

```typescript
import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile } from '../utils/file';
import { loadEnvFile } from '../utils/env';
import { isModelGatePassed } from './state-manager';
import { Step2ConfirmRunResult } from '../types/step2-confirm';

/**
 * Verify Step 2 outline has been generated
 */
async function verifyStep2OutlineGenerated(): Promise<void> {
  logger.section('Verifying Step 2 Outline Generation');
  
  const state = await readJSONFile<{
    outline_generated: boolean;
  }>('logs/workflow-state.json');
  
  if (!state || !state.outline_generated) {
    throw new Error('Step 2 outline has not been generated. Please run: npm run step2:outline');
  }
  
  // Verify output/outline.md exists
  const outline = await readTextFile('output/outline.md');
  if (!outline) {
    throw new Error('output/outline.md not found. Please run: npm run step2:outline');
  }
  
  // Verify logs/step2-outline-run.json exists and has success: true
  const runLog = await readJSONFile<{ success: boolean }>('logs/step2-outline-run.json');
  if (!runLog || !runLog.success) {
    throw new Error('logs/step2-outline-run.json not found or unsuccessful. Please run: npm run step2:outline');
  }
  
  logger.success('Step 2 outline generation verified ✓');
}

/**
 * Main Step 2 confirm runner
 */
export async function runStep2Confirm(): Promise<Step2ConfirmRunResult> {
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
    
    const newPrompt = await readTextFile('output/new-prompt.md');
    if (!newPrompt) {
      throw new Error('output/new-prompt.md not found. Please run: npm run step1');
    }
    logger.success('Step 1 completion verified ✓');

    // Step 3: Verify Step 2 outline generated
    await verifyStep2OutlineGenerated();

    // Step 4: Display outline information
    logger.section('Outline Confirmation');
    logger.info('');
    logger.info('Outline file: output/outline.md');
    logger.info('');
    logger.warn('Please ensure you have reviewed and approved the outline.');
    logger.warn('Future section writing will follow this outline structure.');
    logger.info('');

    // Step 5: Ask user for explicit confirmation
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Have you reviewed and approved output/outline.md?',
      default: false
    }]);

    const checked_at = new Date().toISOString();

    if (confirmed) {
      // Step 6: User confirmed - update workflow state
      const { markStep2OutlineConfirmed } = await import('./state-manager');
      await markStep2OutlineConfirmed();

      // Step 7: Save success log
      const runResult: Step2ConfirmRunResult = {
        success: true,
        confirmed: true,
        checked_at,
        outline_file: 'output/outline.md',
        mock_used: false
      };

      await writeJSONFile('logs/step2-confirm-run.json', runResult);
      logger.success('Saved logs/step2-confirm-run.json');

      logger.section('Outline Confirmed');
      logger.info('');
      logger.success('Outline confirmed successfully ✓');
      logger.info('');
      logger.info('Next steps:');
      logger.info('  • Step 2 section writing: NOT implemented yet');
      logger.info('  • Next development stage will be section writing');

      return runResult;
    } else {
      // Step 8: User rejected - save rejection log
      const runResult: Step2ConfirmRunResult = {
        success: true,
        confirmed: false,
        checked_at,
        outline_file: 'output/outline.md',
        mock_used: false
      };

      await writeJSONFile('logs/step2-confirm-run.json', runResult);
      logger.success('Saved logs/step2-confirm-run.json');

      logger.info('');
      logger.warn('Outline confirmation rejected.');
      logger.info('You can revise or regenerate the outline later:');
      logger.info('  • Revise: Manually edit output/outline.md');
      logger.info('  • Regenerate: npm run step2:outline');
      logger.info('  • Re-confirm: npm run step2:confirm');

      return runResult;
    }

  } catch (error) {
    logger.error('Step 2 confirmation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const runResult: Step2ConfirmRunResult = {
      success: false,
      confirmed: false,
      checked_at: new Date().toISOString(),
      outline_file: 'output/outline.md',
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step2-confirm-run.json', runResult);
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

- [ ] **Step 3: Commit Step 2 confirm runner**

```bash
cd "/Users/admin/tb step by step" && git add src/core/step2-confirm-runner.ts && git commit -m "feat: add Step 2 confirm runner with interactive prompt"
```

---

## Task 4: Step 2 Confirm Command Entry Point

**Files:**
- Create: `src/commands/step2-confirm.ts`
- Modify: `package.json`

- [ ] **Step 1: Create Step 2 confirm command entry point**

Create `src/commands/step2-confirm.ts`:

```typescript
import { logger } from '../utils/logger';
import { runStep2Confirm } from '../core/step2-confirm-runner';

async function step2ConfirmCommand() {
  try {
    logger.section('Step 2: Outline Confirmation');

    await runStep2Confirm();

  } catch (error) {
    logger.error('Step 2 confirmation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step2ConfirmCommand();
```

- [ ] **Step 2: Add npm script**

Read `package.json` and add these two lines to the scripts section after the `step2:outline` lines:

```json
"step2:confirm": "node dist/commands/step2-confirm.js",
"prestep2:confirm": "npm run build",
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

Expected: Output includes `step2:confirm`

- [ ] **Step 5: Commit Step 2 confirm command**

```bash
cd "/Users/admin/tb step by step" && git add src/commands/step2-confirm.ts package.json && git commit -m "feat: add npm run step2:confirm command entry point"
```

---

## Task 5: Final Verification

**Files:**
- No new files

- [ ] **Step 1: Verify final build**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 2: Verify no-fake/no-auto confirmation policy**

Run:
```bash
cd "/Users/admin/tb step by step" && grep -R "confirmed.*true\|auto.*confirm\|fake.*confirm" src dist
```

Expected: No hardcoded auto-confirmation patterns (inquirer.prompt should be present)

- [ ] **Step 3: Verify command structure**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run
```

Expected: Lists all scripts including `step2:confirm`

- [ ] **Step 4: Final commit**

```bash
cd "/Users/admin/tb step by step" && git add -A && git commit -m "feat: complete Step 2 outline confirmation workflow"
```

- [ ] **Step 5: Manual testing instructions**

User should:
1. Ensure Step 2 outline has been generated (output/outline.md exists)
2. Review output/outline.md
3. Run: `npm run step2:confirm`
4. Answer yes or no to the prompt
5. Verify logs/step2-confirm-run.json created with correct confirmed value
6. Check logs/workflow-state.json updated if confirmed yes

---

## Scope Verification

**Implemented requirements:**
✅ Add `npm run step2:confirm` command
✅ Verify model gate has passed
✅ Verify Step 1 has completed
✅ Verify Step 2 outline has been generated
✅ Display outline file path and reminder
✅ Interactive yes/no prompt with inquirer
✅ If yes: update workflow state and save success log
✅ If no: save rejection log without updating confirmation state
✅ No LLM calls (not needed)
✅ Strict no-fake/no-auto confirmation policy

**NOT implemented (as requested):**
- Step 2 section writing
- Step 3 execution mode
- Section file generation

**Quality checks:**
- All code includes complete implementations
- TypeScript strict mode enabled
- Literal type `mock_used: false` enforces no-mock policy
- Interactive prompt requires explicit user input
- Clear error messages and logging
- State management prevents workflow skipping
