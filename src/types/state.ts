// Workflow state tracking
export interface WorkflowState {
  model_configured: boolean;
  model_test_passed: boolean;
  skill_loaded: boolean;
  old_prompt_loaded: boolean;
  tender_file_loaded: boolean;
  step1_model_check_passed: boolean;
  new_prompt_generated: boolean;
  step2_confirmed: boolean;
  outline_generated: boolean;
  outline_confirmed: boolean;
  current_section: string;
  completed_sections: string[];
  final_combined: boolean;
}

// Default initial state
export const INITIAL_WORKFLOW_STATE: WorkflowState = {
  model_configured: false,
  model_test_passed: false,
  skill_loaded: false,
  old_prompt_loaded: false,
  tender_file_loaded: false,
  step1_model_check_passed: false,
  new_prompt_generated: false,
  step2_confirmed: false,
  outline_generated: false,
  outline_confirmed: false,
  current_section: '',
  completed_sections: [],
  final_combined: false
};