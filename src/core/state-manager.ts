import { WorkflowState, INITIAL_WORKFLOW_STATE } from '../types/state';
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { readJSONFile, writeJSONFile, fileExists } from '../utils/file';
import { logger } from '../utils/logger';

const STATE_FILE = 'logs/workflow-state.json';

// Load current workflow state
export async function loadWorkflowState(): Promise<WorkflowState> {
  const state = await readJSONFile<WorkflowState>(STATE_FILE);
  return state || INITIAL_WORKFLOW_STATE;
}

// Save workflow state
export async function saveWorkflowState(
  state: WorkflowState
): Promise<void> {
  await writeJSONFile(STATE_FILE, state);
}

// Check if model gate has passed
export async function isModelGatePassed(): Promise<boolean> {
  try {
    // Check config/model.json exists
    const config = await readJSONFile<ModelConfig>('config/model.json');
    if (!config) return false;

    // Check workflow state flags
    const state = await loadWorkflowState();
    if (!state.model_configured || !state.model_test_passed) {
      return false;
    }

    // Check test result exists and passed
    const testResult = await readJSONFile<ProviderTestResult>('logs/model-test.json');
    if (!testResult) return false;

    // Verify all success criteria
    if (!testResult.success) return false;
    if (testResult.mock_used !== false) return false;
    if (testResult.response_validation_passed !== true) return false;

    // Verify test matches current config
    if (testResult.provider !== config.provider) return false;
    if (testResult.model !== config.model) return false;
    if (testResult.base_url !== config.base_url) return false;

    return true;
  } catch {
    return false;
  }
}

// Update state after successful configuration
export async function markModelConfigured(): Promise<void> {
  const state = await loadWorkflowState();

  // Reset downstream flags when config changes
  state.model_configured = true;
  state.model_test_passed = false;
  state.step1_model_check_passed = false;
  state.new_prompt_generated = false;

  await saveWorkflowState(state);
}

// Update state after Step 1 model check passed
export async function markStep1CheckPassed(): Promise<void> {
  const state = await loadWorkflowState();
  state.step1_model_check_passed = true;
  await saveWorkflowState(state);
  logger.success('Step 1 model check passed');
}

// Update state after Step 1 workflow completed
export async function markStep1Completed(tenderFile: string): Promise<void> {
  const state = await loadWorkflowState();
  state.skill_loaded = true;
  state.old_prompt_loaded = true;
  state.tender_file_loaded = true;
  state.new_prompt_generated = true;
  // Note: We don't set tender_file name in state, but log it in step1-run.json
  await saveWorkflowState(state);
  logger.success('Step 1 workflow completed');
}

// Update state after Step 2 outline generated
export async function markStep2OutlineGenerated(): Promise<void> {
  const state = await loadWorkflowState();
  state.step2_confirmed = false;  // Will be set by user confirmation command later
  state.outline_generated = true;
  state.outline_confirmed = false;
  state.current_section = "";
  state.completed_sections = [];
  state.final_combined = false;
  await writeJSONFile(STATE_FILE, state);
  logger.success('Step 2 outline generated');
}

// Update state after Step 2 outline confirmed by user
export async function markStep2OutlineConfirmed(): Promise<void> {
  const state = await loadWorkflowState();
  state.step2_confirmed = true;
  state.outline_confirmed = true;
  state.current_section = "";
  state.completed_sections = [];
  state.final_combined = false;
  await writeJSONFile(STATE_FILE, state);
  logger.success('Step 2 outline confirmed');
}

// Update state when a section starts being written
export async function markSectionStarted(sectionTitle: string): Promise<void> {
  const state = await loadWorkflowState();
  state.current_section = sectionTitle;
  await writeJSONFile(STATE_FILE, state);
  logger.info(`Started writing section: ${sectionTitle}`);
}

// Update state when a section is completed
export async function markSectionCompleted(outputFilename: string): Promise<void> {
  const state = await loadWorkflowState();
  state.current_section = "";
  if (!state.completed_sections.includes(outputFilename)) {
    state.completed_sections.push(outputFilename);
  }
  await writeJSONFile(STATE_FILE, state);
  logger.success(`Completed section: ${outputFilename}`);
}

// Update state after final document combined
export async function markFinalCombined(): Promise<void> {
  const state = await loadWorkflowState();
  state.final_combined = true;
  await writeJSONFile(STATE_FILE, state);
  logger.success('Final document combined');
}

// Update state after successful test
export async function markModelTestPassed(): Promise<void> {
  const state = await loadWorkflowState();
  state.model_configured = true;
  state.model_test_passed = true;
  await saveWorkflowState(state);
}

// Update state after failed test
export async function markModelTestFailed(): Promise<void> {
  const state = await loadWorkflowState();

  // Check if config exists without throwing on invalid JSON
  const configExists = await fileExists('config/model.json');
  state.model_configured = configExists;
  state.model_test_passed = false;

  await saveWorkflowState(state);
}