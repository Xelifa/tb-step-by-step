export interface WorkflowDashboardRunResult {
  success: boolean;
  checked_at: string;
  model_gate_passed: boolean;
  step1_completed: boolean;
  outline_generated: boolean;
  outline_confirmed: boolean;
  total_sections: number;
  completed_sections: number;
  remaining_sections: number;
  final_combined: boolean;
  next_command: string;
  warnings: string[];
  mock_used: false;  // Literal type - always false
  error?: string;
}
