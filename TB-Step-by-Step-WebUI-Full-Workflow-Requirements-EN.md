# TB Step by Step Full Visual Web UI Requirements

> Purpose: Give this file to Claude Code as the product requirements document for rebuilding or restructuring the Web UI.  
> Goal: Do not build a “terminal command hint dashboard.” Build a local browser-based workspace where users can visually complete the full workflow.

---

## 0. Current Problem

The current Codex-generated Web UI only provides a status dashboard and terminal command hints. It does not truly make the workflow operable from the browser.

Current problems include:

1. The page tells users to run terminal commands such as `npm run config` and `npm run step2:section`.
2. Users cannot configure the model API in the Web UI.
3. Users cannot click buttons in the Web UI to execute Step 1, Step 2 outline generation, section writing, or final combination.
4. Users cannot select a section in the Web UI and generate that section.
5. Users cannot confirm the outline or approve partial final combination in the Web UI.
6. The current Web UI inherits existing development/test state from `logs/`, `output/`, and `input/`, so it does not behave like a clean “new project” entry point.

What I actually need is: **all core workflow steps must be visually operable from the Web UI**. The terminal should only be used to start the local web server:

```bash
npm run web
```

After that, normal users should not need to return to the terminal for workflow operations.

---

## 1. Project Background

The CLI workflow has already been implemented and accepted up to the following stable milestones:

```text
v0.1 Model Gate: real model configuration and testing
v0.2 Step 1: generate new-prompt.md
v0.3 Step 2 Outline: generate outline.md
v0.4 Step 2 Confirm: confirm outline.md
v0.5 Step 2 Section: generate one section at a time
v0.6 Step 2 Status: check section progress
v0.7 Final Combine: combine final document
v0.8 Step 3 Workflow Dashboard: simple workflow dashboard
```

Existing CLI commands include:

```bash
npm run workflow
npm run config
npm run step1
npm run step2:outline
npm run step2:confirm
npm run step2:section
npm run step2:status
npm run final:combine
```

The Web UI must not merely display these commands. It should wrap the underlying capabilities behind browser buttons, forms, upload controls, section selectors, confirmation dialogs, and output previews.

---

## 2. Overall Goal

Build a local Web UI console that allows non-technical users to complete the full bidding document workflow in the browser:

```text
1. Create a new project / reset runtime state
2. Configure model API and run a real connection test
3. Upload tender .docx file
4. Run Step 1 and generate new-prompt.md
5. Run Step 2 outline generation and generate outline.md
6. Review and confirm outline.md in the Web UI
7. Select one section and generate that section
8. View section writing progress
9. Repeat section generation until all sections are complete
10. Run final combination and generate final-combined.md
11. Preview and download output files
```

---

## 3. Core Principles

### 3.1 Do not rewrite accepted core workflow logic

Do not discard or rewrite the accepted CLI core logic. Reuse existing core runners, provider logic, state manager, and file utilities wherever possible.

If existing CLI runners are too tightly coupled with `inquirer`, create Web-specific wrappers or extract shared services. Do not break accepted CLI commands.

### 3.2 The Web UI must be truly operable

The Web UI should not tell users:

```text
Please run npm run config in the terminal.
```

Except for starting the web server, users should be able to complete workflow operations from the browser.

### 3.3 Local tool only, not a public web service

This is a local tool. It should run by default at:

```text
http://localhost:3000
```

No authentication system, cloud deployment, or multi-user permission system is required.

### 3.4 Strict secret protection

The Web UI must never display or leak:

```text
.env
API keys
Authorization headers
x-api-key headers
raw provider secrets
raw config/model.json content
```

API keys may be entered once in the browser and sent to the local backend, where they are written to `.env`. The backend must never return API key values to the frontend.

---

## 4. Recommended Technical Approach

Prefer the existing project stack:

```text
Express + TypeScript + local static HTML/CSS/JS
```

Do not introduce React/Vite unless explicitly approved. The current priority is a low-cost, complete local workflow UI rather than a large frontend framework.

Suggested structure:

```text
src/web/server.ts
src/web/public/index.html
src/web/public/app.js
src/web/public/styles.css
```

You may refactor the existing Web UI files. If the Codex-generated Web UI is too messy, it is acceptable to replace the existing Web UI implementation while preserving the accepted CLI core logic.

---

## 5. Required Page Modules

The Web UI should include at least the following modules.

### 5.1 Top workflow dashboard

Display current workflow status:

```text
Model Gate: passed / pending
Tender File: uploaded / pending
Step 1 new-prompt: completed / pending
Step 2 outline: completed / pending
Step 2 confirmation: confirmed / pending
Sections: completed X / total Y
Final combine: completed / pending / partial
```

Display the recommended next action in user-friendly language:

```text
Next step: Configure model API / Upload tender file / Run Step 1 / Generate outline / Confirm outline / Write section / Combine final document
```

### 5.2 New project / reset runtime

Provide a visible button:

```text
New Project / Reset Runtime
```

Support at least two modes.

#### A. Reset workflow only default

Clear:

```text
logs/*.json
output/new-prompt.md
output/outline.md
output/final-combined.md
output/sections/*.md
input/*.docx
```

Keep:

```text
.env
config/model.json
sources/
src/
docs/
CLAUDE.md
package.json
```

#### B. Reset everything and start from model API configuration

Clear workflow runtime files and model configuration state:

```text
config/model.json
logs/model-test.json
logs/workflow-state.json
```

Deleting `.env` should require a second explicit confirmation. By default, do not delete `.env`, to avoid accidentally deleting API keys.

After reset, the page should show:

```text
Model Gate: pending
Step 1: pending
Step 2 outline: pending
Sections: 0 / 0
Final combine: pending
Next step: Configure model API
```

### 5.3 Model API configuration panel

The Web UI must provide a model configuration form.

Fields:

```text
Provider
Base URL
Model
API Key Env Var
API Key Value
Temperature
Max Tokens
Timeout Seconds
```

Provider options:

```text
openai
deepseek
glm
claude-compatible
custom
```

Recommended defaults:

```text
DeepSeek:
provider: deepseek
base_url: https://api.deepseek.com
model: deepseek-chat
api_key_env: DEEPSEEK_API_KEY

OpenAI:
provider: openai
base_url: https://api.openai.com/v1
model: gpt-4o
api_key_env: OPENAI_API_KEY
```

Requirements:

1. API Key input must be a password field.
2. After saving, the API key must not be displayed in the frontend.
3. Clicking “Save & Test” must trigger a real backend model test.
4. After a successful test, Model Gate should become passed.
5. Failed tests should show non-sensitive error messages.
6. No mock, fake, or hardcoded success is allowed.

### 5.4 Tender document upload

Provide a `.docx` upload area.

Requirements:

1. Only allow `.docx`.
2. Save to `input/`.
3. If a tender file already exists, ask whether to replace it.
4. Do not allow arbitrary upload paths.
5. Refresh workflow status after successful upload.

### 5.5 Step 1 execution panel

Provide a button:

```text
Run Step 1: Generate new-prompt.md
```

On click:

1. Backend runs the real Step 1 flow.
2. Page shows running/progress state.
3. On success, `output/new-prompt.md` is generated.
4. Frontend can preview `new-prompt.md`.
5. On failure, show a non-sensitive error message.

Do not ask the user to run `npm run step1` in the terminal.

### 5.6 Step 2 Outline execution panel

Provide a button:

```text
Generate Outline
```

On click:

1. Backend runs the real Step 2 outline flow.
2. On success, `output/outline.md` is generated.
3. Frontend can preview `outline.md`.
4. Frontend displays the section list from the outline.
5. On failure, show a non-sensitive error message.

Do not ask the user to run `npm run step2:outline` in the terminal.

### 5.7 Outline confirmation panel

Provide a button:

```text
Confirm Outline
```

Before confirmation, show:

```text
Please confirm that you have reviewed and approved output/outline.md. Future section writing will follow this outline.
```

After user confirmation:

1. Set `step2_confirmed: true`
2. Set `outline_confirmed: true`
3. Write `logs/step2-confirm-run.json`
4. Refresh workflow status

Do not use terminal `inquirer`.

### 5.8 Single section writing panel

This is a key requirement.

Requirements:

1. Read section list from `logs/step2-outline-run.json`.
2. Filter out completed sections.
3. Display available sections in the Web UI.
4. User selects exactly one section.
5. User clicks:

```text
Generate Selected Section
```

6. Backend calls the real LLM and generates only that one section.
7. Save to:

```text
output/sections/<output_filename>
```

8. Refresh completed section count after success.
9. Frontend can preview the newly generated section.
10. If target file already exists, show a Web confirmation dialog before overwriting. Default is No.
11. Each run must generate only one section. Do not automatically continue to the next section.

Do not ask the user to run `npm run step2:section` in the terminal.

### 5.9 Progress check panel

The Web UI should display:

```text
Total sections
Completed sections
Remaining sections
Current section
Generated files
Warnings
```

You may reuse the analysis logic behind `step2:status`, but the result must be shown directly in the Web UI.

### 5.10 Final combination panel

Provide a button:

```text
Combine Final Document
```

On click:

1. Backend checks whether all sections have been generated.
2. If sections are missing, show Web confirmation:

```text
Some sections are still missing. Combine completed sections only?
```

Default is No.

3. If user chooses No:
   - do not generate `final-combined.md`
   - do not set `final_combined`

4. If user chooses Yes:
   - generate a partial final document
   - insert this placeholder for missing sections:

```text
[Not generated: this section has not been generated through the Web UI yet.]
```

5. If all sections are complete:
   - generate complete `output/final-combined.md`

6. The combination process must not call the LLM and must not rewrite section body content.

### 5.11 Output preview and download

Provide output file list and preview:

```text
output/new-prompt.md
output/outline.md
output/sections/*.md
output/final-combined.md
```

Support:

1. Click to preview Markdown content.
2. Download file.
3. Do not allow arbitrary path access.
4. Do not allow access to `.env` or `config/model.json`.

### 5.12 Log viewer

Allow viewing safe logs:

```text
logs/model-test.json
logs/step1-run.json
logs/step2-outline-run.json
logs/step2-confirm-run.json
logs/step2-section-run.json
logs/step2-status-run.json
logs/final-combine-run.json
logs/workflow-state.json
```

Log viewing must apply sanitization:

1. Do not display API keys.
2. Do not display Authorization headers.
3. Do not display x-api-key headers.
4. Do not display `.env` content.

---

## 6. Suggested Backend API

Suggested Web API endpoints.

### 6.1 Status endpoints

```text
GET /api/status
GET /api/model-config/status
GET /api/sections
GET /api/outputs
GET /api/logs
```

### 6.2 Operation endpoints

```text
POST /api/project/reset
POST /api/model-config/save-and-test
POST /api/upload-tender
POST /api/step1/run
POST /api/step2/outline
POST /api/step2/confirm
POST /api/step2/section
POST /api/final/combine
```

### 6.3 File preview endpoints

```text
GET /api/output/file?name=...
GET /api/log/file?name=...
GET /api/download?name=...
```

All file paths must be whitelisted. Arbitrary file reading is forbidden.

---

## 7. How to Reuse Existing CLI Logic

Preferred approach:

### Best option: reuse core runners

If existing core runners can be called directly, call core functions in Web API handlers, for example:

```text
runStep1()
runStep2Outline()
runFinalCombine()
```

### Second-best option: add Web-specific wrappers

If existing runners depend on `inquirer`, create Web-specific wrappers, for example:

```text
runStep2ConfirmFromWeb()
runStep2SectionFromWeb(sectionId, overwrite)
runFinalCombineFromWeb(allowPartial)
```

### Not recommended: running npm commands

Do not simply execute `npm run step2:section` from the Web backend, because it may hang on terminal prompts and cannot complete browser-based selection.

---

## 8. Security Requirements

Strictly follow these rules:

1. Do not allow arbitrary shell commands.
2. Do not let the frontend pass arbitrary commands.
3. Do not allow arbitrary file path reads.
4. Do not expose `.env`.
5. Do not expose API keys.
6. Do not expose raw `config/model.json`.
7. Do not write API keys to logs.
8. Do not include secrets in error messages.
9. Do not mock successful model tests.
10. Do not fake LLM responses.
11. Do not use fallback providers.

---

## 9. UI Design Direction

Use a “local bidding workflow console” style:

```text
White / warm white / light gray background
Deep blue primary color
Gold or orange accent color
Card-based workflow status
Left step navigation or top workflow stepper
Main operation panel in the center
Output preview / log preview panel on the right
```

The page should clearly distinguish:

```text
Current step
Next action
Completed items
Pending items
Output files
Security notices
```

Do not leave the page in default browser HTML styling.

---

## 10. Phased Implementation Plan

To reduce token usage and risk, implement this in 3 phases.

### Phase 1: Web model configuration + project reset + tender upload

Implement:

```text
Web model configuration
Save & Test
New Project / Reset Runtime
Upload docx
Status refresh
```

Acceptance criteria:

```text
User does not need terminal npm run config
User can configure model in browser
User can upload tender docx in browser
Status correctly shows next step as Step 1
```

### Phase 2: Web Step 1 + Outline + Confirm

Implement:

```text
Run Step 1
Generate Outline
Preview new-prompt.md
Preview outline.md
Confirm Outline
```

Acceptance criteria:

```text
User does not need terminal step1 / step2:outline / step2:confirm
Browser can complete outline generation and confirmation
```

### Phase 3: Web section writing + progress + final combine

Implement:

```text
Section list
Select section
Generate Selected Section
Section preview
Progress status
Final combine
Download final-combined.md
```

Acceptance criteria:

```text
User does not need terminal step2:section / step2:status / final:combine
Browser can complete section writing and final combination
```

---

## 11. Minimum End-to-End Acceptance Flow

The final Web UI must support:

```text
1. npm run web
2. Open localhost:3000 in browser
3. Click New Project / Reset Everything
4. Configure DeepSeek API in the Web UI and pass model test
5. Upload tender docx
6. Click Run Step 1
7. Preview new-prompt.md
8. Click Generate Outline
9. Preview outline.md
10. Click Confirm Outline
11. Select one section
12. Click Generate Selected Section
13. Preview generated section md
14. View progress
15. Continue generating other sections
16. Click Combine Final Document
17. Preview / download final-combined.md
```

---

## 12. Delivery Requirements

After implementation, you must:

1. Run:

```bash
npm run build
npm run web
```

2. Confirm the page opens.
3. Confirm CSS is loaded.
4. Confirm model configuration works in the Web UI.
5. Confirm tender docx upload works in the Web UI.
6. Confirm Step 1 can be run from the Web UI.
7. Confirm outline can be generated and confirmed from the Web UI.
8. Confirm a section can be selected and generated from the Web UI.
9. Confirm final combination can be run from the Web UI.
10. Confirm `.env` and `config/model.json` cannot be accessed through the browser.
11. Commit:

```bash
git commit -m "feat: implement full visual web workflow"
```

---

## 13. Critical Reminder

The goal is not to build a page that only displays status.

The goal is:

```text
A normal user who does not know terminal commands can operate the full TB Step by Step workflow in the browser.
```

The terminal should only be used for:

```bash
npm run web
```

All business workflow operations should happen in the browser.
