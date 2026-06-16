/**
 * Centralized UI text configuration for the guided Web UI.
 *
 * Usage:
 *   - HTML: <script src="/ui-text.js"></script>  (before app.js)
 *   - JS:   const t = window.UI_TEXT;
 *            t.buttons.runStep1   → '运行 Step 1'
 *
 * All visible strings should reference window.UI_TEXT where feasible.
 * Falls back to English defaults if window.UI_TEXT is absent.
 */
window.UI_TEXT = {
  // App chrome
  appTitle: 'TB 技术部分生成工作台',
  appSubtitle: '本地投标技术文件生成向导',
  brandMark: 'TB',
  brandKicker: 'TB Step by Step',
  brandTitle: '投标文件生成工作台',

  // Reset buttons
  resetWorkflowOnly: '重置当前项目',
  resetEverything: '重新配置模型并重置项目',
  resetWorkflowTooltip: 'Clear workflow files only. Keeps model config and .env.',
  resetEverythingTooltip: 'Clear everything and remove config/model.json. .env is kept by default.',

  // Step names
  steps: {
    model: '模型配置',
    upload: '上传招标文件',
    step1: '生成 new-prompt',
    outline: '生成大纲',
    confirm: '确认大纲',
    sections: '生成章节',
    combine: '合并文档',
    export: '导出成果'
  },

  // Buttons and CTAs
  buttons: {
    saveAndTest: '保存并测试模型',
    uploadTender: '上传招标文件',
    runStep1: '运行 Step 1',
    generateOutline: '生成大纲',
    confirmOutline: '确认大纲',
    generateSection: '生成选中章节',
    generateSelectedSections: '生成勾选章节',
    generateAllSections: '生成所有剩余章节',
    combineFinal: '合并最终文档',
    downloadDocx: '下载 Word 文档',
    downloadMd: '下载 Markdown 源文件'
  },

  // Step panel instructions (shown in the main panel)
  instructions: {
    model: '填写模型信息并保存。保存后点击"继续"进入下一步。',
    upload: '上传招标文件（.docx）。上传成功后点击"继续"。',
    step1: '点击"运行 Step 1"基于招标文件生成 new-prompt.md。',
    outline: '点击"生成大纲"基于 new-prompt.md 和招标文件生成三级目录大纲。',
    confirm: '审阅大纲内容，确认后点击"确认大纲"进入章节生成阶段。',
    sections: '选择并生成章节。可单选、勾选多选或一键生成全部剩余章节。',
    combine: '将已生成的章节按大纲顺序合并为最终正文。可合并部分章节（插入占位符）。',
    export: '下载最终成果文件。DOCX 为投标常用 Word 格式，MD 为可读源文件。'
  },

  // Inline status / placeholder text
  status: {
    modelTestPassed: 'Model test passed.',
    modelTestFailed: 'Model test failed',
    uploadSuccess: '已上传',
    step1Running: 'Running Step 1…',
    step1Success: 'Step 1 完成。',
    step1Failed: 'Step 1 失败',
    outlineRunning: '正在生成大纲…',
    outlineSuccess: '大纲已生成。',
    outlineFailed: '生成失败',
    confirmRunning: '确认中…',
    confirmSuccess: '大纲已确认。',
    confirmFailed: '确认失败',
    sectionGenerating: '生成中…',
    sectionSuccess: '已生成',
    sectionFailed: '失败',
    combineRunning: '合并中…',
    combineSuccess: '已合并',
    combineFailed: '合并失败',
    missingSectionsHint: '部分章节尚未生成。是否仅合并已完成的章节？'
  },

  // Navigation
  nav: {
    back: '← 上一步',
    continue: '继续 →',
    skip: '跳过'
  },

  // Toast / notification
  toast: {
    modelSaved: 'Model configuration saved.',
    uploadSuccess: 'Tender uploaded.',
    step1Done: 'Step 1 completed successfully.',
    outlineDone: 'Outline generated successfully.',
    outlineConfirmed: 'Outline confirmed.',
    sectionDone: 'Section generated.',
    selectedSectionsStarted: 'Generating selected sections…',
    batchStarted: 'Batch section generation started…',
    combineDone: 'Combined {combined}/{total} sections.',
    resetDone: 'Reset complete.',
    downloadStarted: 'Downloading…'
  }
};
