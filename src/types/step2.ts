import { ProviderType } from './config';

export interface OutlineSection {
  level: number;           // 1, 2, or 3 (一级/二级/三级目录)
  title: string;          // Section title
  writing_purpose: string; // 写作目的
  key_points: string[];   // 关键内容点
  source_basis: string;   // 源依据 (来自招标文件)
  needs_research: boolean; // 是否需要联网/政策检索
  output_filename: string; // 建议输出文件名 (如 section-项目背景.md)
}

export interface Outline {
  document_title: string;     // 总标题
  sections: OutlineSection[]; // 所有章节
  modules: {
    background: string[];     // 项目背景模块章节标题
    objectives: string[];     // 工作目标模块章节标题
    content: string[];        // 工作内容模块章节标题
    methods: string[];        // 工作方法模块章节标题
    results: string[];        // 项目成果模块章节标题
    challenges: string[];     // 项目重点、难点分析模块章节标题
    solutions: string[];      // 项目重点、难点应对措施模块章节标题
    suggestions: string[];    // 相关的合理化建议模块章节标题
  };
}

export interface Step2OutlineRunResult {
  success: boolean;
  checked_at: string;
  provider: ProviderType;
  model: string;
  base_url: string;
  tender_file: string;
  new_prompt_loaded: boolean;
  step2_instructions_loaded: boolean;
  step3_instructions_loaded: boolean;
  tender_loaded: boolean;
  outline_generated: boolean;
  outline?: Outline;
  mock_used: false;  // Literal type - always false
  error?: string;
}
