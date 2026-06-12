import { ProviderType, ModelConfig } from './config';

// Provider interface - all providers must implement this
export interface IProvider {
  readonly name: string;
  readonly type: ProviderType;

  // Execute a real API call with given prompt
  call(prompt: string, config: ModelConfig): Promise<string>;

  // Call API with explicit parameters (for Step 1 runner)
  callAPI(
    baseUrl: string,
    apiKey: string,
    model: string,
    prompt: string,
    config: ModelConfig
  ): Promise<string>;
}

// Result from centralized tester
export interface ProviderTestResult {
  success: boolean;
  provider: ProviderType;
  model: string;
  base_url: string;
  test_prompt: string;
  test_response: string;
  checked_at: string;
  mock_used: false;  // Hard-coded literal type - always false
  response_validation_passed?: boolean;
  error?: string;
}