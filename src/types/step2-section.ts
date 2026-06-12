import { ProviderType } from './config';
import { OutlineSection } from './step2';

export interface Step2SectionRunResult {
  success: boolean;
  checked_at: string;
  provider: ProviderType;
  model: string;
  base_url: string;
  selected_section: {
    title: string;
    level: number;
    output_filename: string;
  };
  output_file: string;
  overwritten: boolean;
  mock_used: false;  // Literal type - always false
  error?: string;
}

export interface SectionGenerationPrompt {
  section_title: string;
  section_level: number;
  writing_purpose: string;
  key_points: string[];
  source_basis: string;
  needs_research: boolean;
  new_prompt: string;
  tender_content: string;
  step2_rules: string;
  step3_rules: string;
}
