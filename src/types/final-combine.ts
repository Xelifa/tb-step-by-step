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
