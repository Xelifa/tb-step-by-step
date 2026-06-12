export interface Step2ConfirmRunResult {
  success: boolean;
  confirmed: boolean;
  checked_at: string;
  outline_file: string;
  mock_used: false;  // Literal type - always false
  error?: string;
}
