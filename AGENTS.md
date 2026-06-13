# TB Step by Step｜Codex 项目总控说明

## 0. 项目定位

本项目不是自主 Agent，也不是让模型自由判断任务路径的智能体系统，而是一个 **固定步骤、文件驱动、人控确认的招投标写作工作流工具** 。

核心目标是：
将用户在 ChatGPT 项目“TB Step by Step”中已经验证有效的工作流程，迁移为 Codex 本地项目中的可复用工作流。

本项目必须坚持以下原则：

1. 先完成真实模型配置，再进入任何写作流程。
2. 不允许使用 mock 模型、假模型、占位模型或伪造 API 返回。
3. 所有 Step 均必须基于真实 LLM API 调用执行。
4. 工作流固定，不允许模型自行跳步。
5. 每一阶段均需形成明确文件输出。
6. 分段撰写必须大纲先行、逐节确认、每节暂停。
7. 缺失信息必须使用 `[需补充：XXX]` 占位，不得编造。
8. Step 1 生成 `new-prompt.md` 前，必须再次校核模型与 API 是否真实可用。

---

## 1. 第一门禁：模型供应商与 API 配置

### 1.1 必须先配置模型

项目启动后的第一步，必须进入模型配置流程。
在模型配置完成并测试通过前，禁止执行以下操作：

* 禁止读取招标文件并开始分析；
* 禁止执行 `step1.md`；
* 禁止生成 `new-prompt.md`；
* 禁止生成大纲；
* 禁止撰写任何投标正文；
* 禁止调用任何 mock provider；
* 禁止使用硬编码内容伪装模型输出。

### 1.2 配置方式

模型配置应采用类似 `CC Switch` 的交互逻辑：
用户自行选择供应商、填写 API Key、Base URL、模型名称，并通过测试后保存配置。

建议支持以下模型供应商类型：

```text
OpenAI
DeepSeek
GLM
Codex-compatible
OpenAI-compatible Custom Provider
```

### 1.3 用户必须配置的字段

配置文件建议保存为：

```text
config/model.json
```

字段至少包括：

```json
{
  "provider": "",
  "base_url": "",
  "api_key_env": "",
  "model": "",
  "temperature": 0.2,
  "max_tokens": 6000,
  "timeout_seconds": 120,
  "stream": false
}
```

其中：

* `provider`：模型供应商名称；
* `base_url`：API 地址；
* `api_key_env`：环境变量名称，不得明文写入 API Key；
* `model`：具体模型名称；
* `temperature`：默认建议 0.2；
* `max_tokens`：根据模型能力配置；
* `timeout_seconds`：请求超时时间；
* `stream`：是否流式输出。

### 1.4 API Key 管理

API Key 不得写入 `model.json`。
必须写入 `.env` 文件，例如：

```env
OPENAI_API_KEY=sk-xxxx
DEEPSEEK_API_KEY=sk-xxxx
GLM_API_KEY=xxxx
CUSTOM_API_KEY=xxxx
```

Codex 执行时应读取 `.env`，再根据 `config/model.json` 中的 `api_key_env` 获取实际密钥。

### 1.5 禁止 mock 模型

本项目严禁出现以下内容：

```text
MockProvider
mock_llm
fake_response
dummy_response
placeholder_model
return "这是模拟回答"
return {"content": "mock"}
```

如代码中存在 mock provider，应删除或禁用。
如果为了开发调试保留 mock 代码，也必须保证生产工作流无法调用 mock。

### 1.6 模型连接测试

配置完成后，必须执行真实 API 测试。

测试 Prompt 固定为：

```text
请回复“TB_MODEL_TEST_OK”，不要输出其他内容。
```

测试通过标准：

1. 成功连接真实 API；
2. 返回内容包含 `TB_MODEL_TEST_OK`；
3. 返回内容不是本地硬编码；
4. 响应中能够记录 provider、model、时间戳；
5. 未发生鉴权错误、超时错误、模型不存在错误。

测试通过后，生成：

```text
logs/model-test.json
```

内容建议包括：

```json
{
  "status": "success",
  "provider": "",
  "model": "",
  "base_url": "",
  "checked_at": "",
  "test_prompt": "请回复“TB_MODEL_TEST_OK”，不要输出其他内容。",
  "test_response": "",
  "mock_used": false
}
```

如果测试失败，必须停止流程，并提示用户重新配置模型。

---

## 2. 项目文件结构

建议采用以下目录结构：

```text
tb-step-by-step/
├─ AGENTS.md
├─ .env
├─ config/
│  └─ model.json
├─ sources/
│  ├─ SKILL.md
│  ├─ old-prompt.md
│  ├─ step1.md
│  ├─ step2.md
│  └─ step3.md
├─ input/
│  └─ tender.docx
├─ output/
│  ├─ new-prompt.md
│  ├─ outline.md
│  ├─ final-combined.md
│  └─ sections/
│     ├─ section-项目背景.md
│     ├─ section-工作目标.md
│     ├─ section-工作内容.md
│     ├─ section-工作方法.md
│     ├─ section-项目成果.md
│     ├─ section-项目重点难点分析.md
│     ├─ section-项目重点难点应对措施.md
│     ├─ section-相关的合理化建议.md
│     └─ section-技术路线.md
└─ logs/
   ├─ model-test.json
   ├─ step1-model-check.json
   ├─ step1-run.json
   ├─ step2-outline-run.json
   └─ section-run-log.json
```

---

## 3. 固定工作流总览

完整流程如下：

```text
第一步：配置模型供应商与 API
↓
测试真实 API 调用
↓
测试通过后解锁工作流
↓
读取 sources/SKILL.md 作为总规则
↓
读取 sources/old-prompt.md 作为旧模板
↓
用户上传新招标文件至 input/
↓
执行 sources/step1.md
↓
Step 1 执行前再次校核模型与 API
↓
生成 output/new-prompt.md
↓
用户确认进入 Step 2
↓
执行 sources/step3.md 的大纲先行机制
↓
生成 output/outline.md
↓
用户确认大纲
↓
按 sources/step2.md 的 8 个模块逐节撰写
↓
每节写完保存 section-*.md 并暂停
↓
全部完成后串联组合
↓
生成 output/final-combined.md
```

---

## 4. Step 1：旧 Prompt 适配

### 4.1 Step 1 输入

Step 1 的输入包括：

```text
sources/SKILL.md
sources/old-prompt.md
sources/step1.md
input/新招标文件.docx
```

其中：

* `SKILL.md` 是总规则；
* `old-prompt.md` 是旧 Prompt 模板；
* `step1.md` 是旧 Prompt 适配流程；
* 新招标文件是本次项目的真实需求来源。

### 4.2 Step 1 执行前必须再次校核模型

在生成 `new-prompt.md` 之前，必须再次执行模型校核。
该校核不是首次配置测试的替代，而是 Step 1 的前置安全检查。

校核 Prompt 固定为：

```text
请回复“TB_STEP1_MODEL_CHECK_OK”，不要输出其他内容。
```

校核通过标准：

1. 真实 API 调用成功；
2. 返回内容包含 `TB_STEP1_MODEL_CHECK_OK`；
3. `mock_used` 必须为 `false`；
4. 当前 provider、model 与 `config/model.json` 一致；
5. 不得使用缓存结果替代本次测试；
6. 不得用本地字符串伪造测试结果。

校核日志保存为：

```text
logs/step1-model-check.json
```

如果 Step 1 模型校核失败，必须停止执行，并提示：

```text
Step 1 已停止：当前模型或 API 未通过真实调用校核。请重新配置模型供应商、API Key、Base URL 或模型名称后再次测试。
```

### 4.3 Step 1 处理逻辑

校核通过后，开始执行 `step1.md`。

必须完成以下工作：

1. 读取 `old-prompt.md`；
2. 解析新招标文件；
3. 提取新项目关键信息；
4. 识别旧 Prompt 与新招标文件之间的差异；
5. 判断保留项、替换项、新增项、删除项；
6. 生成适配结论摘要；
7. 生成旧 Prompt 适配诊断；
8. 生成完整新 Prompt；
9. 生成关键替换点清单；
10. 保存完整新 Prompt 为 `output/new-prompt.md`。

### 4.4 Step 1 输出

Step 1 必须同时输出聊天摘要和文件。

聊天摘要包括：

```text
A. 适配结论摘要
B. 旧 Prompt 适配诊断
C. new-prompt.md 已生成
D. 关键替换点清单
E. 是否进入 Step 2 的确认提示
```

文件输出为：

```text
output/new-prompt.md
logs/step1-run.json
```

完成后必须暂停，等待用户确认是否进入 Step 2。

---

## 5. Step 2 前置：用户确认进入正文阶段

只有当用户明确输入类似以下指令时，才允许进入 Step 2：

```text
开始下一步 Step 2：分段撰写投标文件正文
```

或：

```text
确认进入 Step 2
```

未获得用户确认前，不得自动生成大纲，不得撰写正文。

---

## 6. Step 3：大纲先行机制

进入 Step 2 后，先执行 `step3.md` 的大纲先行机制，而不是直接撰写正文。

### 6.1 大纲生成输入

输入包括：

```text
output/new-prompt.md
sources/step2.md
sources/step3.md
input/新招标文件.docx
```

### 6.2 大纲生成要求

必须生成包含三级目录的详实大纲。
大纲应覆盖 `step2.md` 中规定的 8 个模块：

```text
1. 项目背景
2. 工作目标
3. 工作内容
4. 工作方法
5. 项目成果
6. 项目重点、难点分析
7. 项目重点、难点的应对措施
8. 相关的合理化建议
```

如项目确有需要，可补充技术路线、进度安排、保障措施、服务承诺等内容，但不得脱离招标文件要求。

### 6.3 大纲输出

大纲必须保存为：

```text
output/outline.md
```

聊天框中输出：

```text
我已经为您生成第一阶段的详实大纲，请确认是否需要调整：
[大纲内容]

---
✅ 请确认大纲无误后，指示我撰写具体章节（例如："请按大纲撰写 1.1 节"）
```

生成大纲后必须暂停。

---

## 7. Step 2：按 8 个模块逐节撰写正文

用户确认大纲后，进入逐节撰写阶段。

### 7.1 逐节撰写规则

每次只允许撰写用户指定的一个小节。

例如用户输入：

```text
请按大纲撰写 1.1 节 项目背景与总体认识
```

系统只能撰写该小节，不能继续写 1.2，也不能扩展到其他章节。

### 7.2 正文模块要求

正文撰写必须遵循 `step2.md` 的 8 个模块要求：

```text
项目背景
工作目标
工作内容
工作方法
项目成果
项目重点、难点分析
项目重点、难点的应对措施
相关的合理化建议
```

其中：

1. 项目背景必须结合最新政策、行业导向和典型实践；
2. 工作目标必须基于 `new-prompt.md`；
3. 工作内容必须针对工作目标展开；
4. 工作方法必须针对工作内容提出；
5. 项目成果必须明确成果名称、数量和要求；
6. 重点难点分析必须对照评分准则；
7. 应对措施必须与重点难点数量一一对应；
8. 合理化建议必须与重难点形成呼应。

### 7.3 防幻觉规则

遇到以下信息缺失时，必须使用占位符：

```text
[需补充：XXX]
```

包括但不限于：

* 地方特定数据；
* 现状底数；
* 项目边界；
* 服务对象；
* 企业资源；
* 具体案例细节；
* 成果数量；
* 评分细则；
* 特定政策文件名称；
* 招标文件未明确的信息。

不得自行脑补。

### 7.4 配图提醒规则

遇到适合可视化表达的位置，应插入：

```text
[🖼️此处建议插入图表：图表名称，内容说明]
```

常见位置包括：

* 技术路线图；
* 研究框架图；
* 工作流程图；
* 案例对比表；
* 重点难点—应对措施矩阵；
* 项目成果体系图；
* 政策传导逻辑图；
* 实施进度安排表；
* 多主体协同机制图。

### 7.5 章节输出文件

每节正文完成后，必须保存到：

```text
output/sections/
```

文件命名建议：

```text
section-章节编号-章节标题.md
```

例如：

```text
output/sections/section-1.1-项目背景与总体认识.md
```

同时更新：

```text
logs/section-run-log.json
```

### 7.6 每节完成后的固定暂停语

每节正文完成后，必须在聊天框末尾输出：

```text
---
本节已撰写完毕。请问是否有需要修改补充的地方？

如果确认无误，请指示我撰写下一节 [下一节标题]
```

输出后必须停止，等待用户下一步指令。

---

## 8. 修改与微调规则

当用户要求修改某一节时，必须：

1. 读取对应 `section-*.md`；
2. 理解用户修改意见；
3. 只修改指定章节；
4. 不影响其他章节；
5. 保存覆盖或另存修订版；
6. 在日志中记录修改时间与修改说明。

建议保存方式：

```text
output/sections/section-1.1-项目背景与总体认识.md
output/sections/history/section-1.1-项目背景与总体认识-v1.md
```

修改完成后仍须暂停，等待用户确认。

---

## 9. 全部完成后的串联组合

当用户明确表示全部章节完成后，才允许进入串联组合阶段。

用户指令示例：

```text
全部章节已确认，开始串联组合
```

### 9.1 串联组合输入

读取：

```text
output/outline.md
output/sections/*.md
output/new-prompt.md
sources/step2.md
sources/step3.md
```

### 9.2 技术路线生成

串联组合前，应读取已生成正文，生成技术路线部分。
技术路线必须包括：

1. 简要冒段文字；
2. mermaid 技术路线图代码。

输出为：

```text
output/sections/section-技术路线.md
```

### 9.3 完整正文输出

按大纲顺序组合所有章节，生成：

```text
output/final-combined.md
```

完成后输出：

```text
已完成完整正文串联组合，文件已保存至 output/final-combined.md。
```

---

## 10. 运行状态管理

项目应维护一个状态文件：

```text
logs/workflow-state.json
```

建议字段：

```json
{
  "model_configured": false,
  "model_test_passed": false,
  "skill_loaded": false,
  "old_prompt_loaded": false,
  "tender_file_loaded": false,
  "step1_model_check_passed": false,
  "new_prompt_generated": false,
  "step2_confirmed": false,
  "outline_generated": false,
  "outline_confirmed": false,
  "current_section": "",
  "completed_sections": [],
  "final_combined": false
}
```

工作流必须根据状态文件判断是否允许进入下一步。
如果前置状态未满足，应拒绝继续执行，并提示用户完成前置步骤。

---

## 11. 严格禁止行为

本项目中禁止以下行为：

1. 未配置模型就开始执行任务；
2. 未测试 API 就读取招标文件并生成内容；
3. 使用 mock 模型、假返回、硬编码回答；
4. Step 1 未再次校核模型就生成 `new-prompt.md`；
5. 跳过 `SKILL.md` 直接执行子步骤；
6. 跳过 `old-prompt.md` 直接新写 Prompt；
7. 不读取招标文件就编造项目内容；
8. 未生成 `new-prompt.md` 就进入 Step 2；
9. 未经用户确认就生成大纲；
10. 未经用户确认大纲就开始写正文；
11. 一次性写完整正文；
12. 用户只要求一节时连续写多节；
13. 缺失信息时自行脑补；
14. 不保存文件，只在聊天框输出；
15. 重点难点与应对措施数量不对应；
16. 完成章节后不暂停；
17. 自动进入下一节；
18. 自动串联最终正文。

---

## 12. 默认启动语

当项目首次启动时，应输出：

```text
欢迎使用 TB Step by Step 工作流。

在进入招投标 Prompt 适配与正文撰写前，必须先完成模型供应商与 API 配置。

请先配置：
1. 模型供应商
2. Base URL
3. API Key 环境变量
4. 模型名称
5. temperature
6. max_tokens

配置完成后，我将执行真实 API 测试。测试通过后，才能进入下一步。
```

---

## 13. 模型测试通过后的提示语

```text
模型配置已通过真实 API 测试。

接下来我将按顺序读取：
1. sources/SKILL.md
2. sources/old-prompt.md
3. sources/step1.md

请将新的招标文件放入 input/ 目录，然后指示我执行 Step 1：旧 Prompt 适配工作流。
```

---

## 14. Step 1 执行提示语

当用户要求执行 Step 1 时，应先输出：

```text
开始执行 Step 1 前，我将再次校核当前模型与 API 是否真实可用，确保不会使用 mock 模型或无效模型配置。
```

校核通过后再输出：

```text
Step 1 模型校核已通过。现在开始读取 old-prompt.md 与新招标文件，并执行旧 Prompt 适配工作流。
```

---

## 15. Step 1 完成提示语

```text
Step 1 已完成。

已生成：
1. 适配结论摘要
2. 旧 Prompt 适配诊断
3. 完整新 Prompt
4. 关键替换点清单
5. output/new-prompt.md

请确认是否进入 Step 2：分段撰写投标文件正文。
```

---

## 16. Step 2 启动提示语

```text
已确认进入 Step 2。

我将先执行 Step 3 的大纲先行机制，基于 new-prompt.md 和招标文件生成三级目录大纲。生成大纲后我会暂停，等待您确认。
```

---

## 17. 总控执行原则

本项目的核心不是“自动完成投标文件”，而是：

```text
真实模型配置
→ 固定规则读取
→ 旧 Prompt 适配
→ new-prompt.md 生成
→ 用户确认
→ 大纲先行
→ 用户确认
→ 分节撰写
→ 每节暂停
→ 最终组合
```

任何时候，Codex 都必须优先保证：

1. 模型真实可用；
2. 文件读取准确；
3. 步骤顺序正确；
4. 用户确认充分；
5. 输出文件可追溯；
6. 内容不编造；
7. 工作流不跳步。
