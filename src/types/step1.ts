import { ProviderType } from './config';

export interface Step1CheckResult {
  success: boolean;
  provider: ProviderType;
  model: string;
  base_url: string;
  checked_at: string;
  test_prompt: string;  // 固定为：请回复"TB_STEP1_MODEL_CHECK_OK"，不要输出其他内容。
  test_response: string;
  mock_used: false;  // Literal type - always false
  response_validation_passed?: boolean;
  error?: string;
}

export interface AdaptedPrompt {
  adaptation_summary: string;      // A. 适配结论摘要
  adaptation_diagnosis: {
    preserved: string[];           // B. 保留项
    replaced: string[];            // B. 替换项
    added: string[];               // B. 新增项
    deleted: string[];             // B. 删除项
  };
  full_new_prompt: string;         // C. 完整新 Prompt
  key_replacements: string[];      // D. 关键替换点清单
}

export interface Step1RunResult {
  success: boolean;
  checked_at: string;
  provider: ProviderType;
  model: string;
  base_url: string;
  tender_file: string;
  skill_loaded: boolean;
  old_prompt_loaded: boolean;
  step1_instructions_loaded: boolean;
  tender_loaded: boolean;
  model_check_passed: boolean;
  adapted_prompt?: AdaptedPrompt;
  mock_used: false;  // Literal type - always false
  error?: string;
}
