import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { getProvider } from './provider';

// Fixed test prompt - MUST use this exact prompt
const TEST_PROMPT = '请回复"TB_MODEL_TEST_OK"，不要输出其他内容。';

// Validate response contains required test string
function validateTestResponse(response: string): boolean {
  return response.includes('TB_MODEL_TEST_OK');
}

// Execute real API test - NO MOCKS, NO FALLBACKS
export async function testModelConnection(
  config: ModelConfig
): Promise<ProviderTestResult> {
  const provider = getProvider(config.provider);
  const checked_at = new Date().toISOString();

  try {
    // Real API call
    const response = await provider.call(TEST_PROMPT, config);

    // Validate response
    const validation_passed = validateTestResponse(response);

    return {
      success: validation_passed,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      test_prompt: TEST_PROMPT,
      test_response: response,
      checked_at,
      mock_used: false,  // Hard-coded: always false
      response_validation_passed: validation_passed,
      error: validation_passed ? undefined :
        'Response does not contain TB_MODEL_TEST_OK'
    };
  } catch (error) {
    return {
      success: false,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      test_prompt: TEST_PROMPT,
      test_response: '',
      checked_at,
      mock_used: false,
      response_validation_passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}