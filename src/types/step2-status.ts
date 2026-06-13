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
