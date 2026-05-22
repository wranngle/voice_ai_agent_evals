# TestMu AI Agent-Eval Scrape

Captured: 2026-05-19T05:27:05.581058+00:00

This pack is a focused public scrape for competitive analysis of TestMu AI's agent, voice-agent, orchestration, analytics, and docs surfaces. It is not a full copy of their site or docs; see `pages.json` for structured metadata and `assets/` for screenshots.

## High-Signal Product Claims For Voice-Agent Evals

- Agent-to-agent testing is explicitly positioned for testing AI agents, including chatbots, voice assistants, inbound phone agents, and outbound caller agents.
- The agent-to-agent page frames the evaluator as an autonomous AI user/evaluator that engages the system under test and scores responses.
- Claimed quality dimensions include hallucination, bias, toxicity, compliance, accuracy, safety, context awareness, completeness, response quality, and conversation flow.
- Phone-agent claims include real call testing, speaker-identified transcripts, DTMF detection, FCR, intent recognition, CSAT, containment rate, voice quality, STT accuracy, production recording upload, outbound number pools, passive monitoring, voice selection, response timing, and background noise presets.
- The product uses readiness verdict language: Green/Yellow/Red production readiness and confidence by evaluation volume.
- Kane/Kane CLI positions natural-language test authoring and local browser automation as a CLI/agent workflow.
- HyperExecute/Test Insights/API docs expose patterns worth copying: distributed job/task orchestration, artifacts, logs, run analytics, AI root-cause analysis, performance summaries, and test manager run/case APIs.

## Sitemap Discovery

- Public sitemaps checked: https://www.testmuai.com/sitemap.xml, https://www.testmuai.com/support/sitemap.xml
- Total sitemap URLs seen: 9940
- URLs matching agent/eval/docs/API terms: 1887
- Full filtered URL list: `sitemap-filtered.json`
- Browser screenshots: homepage captured successfully; several subpages returned Cloudflare/security verification in headless Chrome, so those rows are marked instead of saving misleading screenshots.

## Useful Architecture Ideas To Borrow

- Add first-class eval modes: `chat_voice`, `phone_inbound`, `phone_outbound`, `production_recording_batch`.
- Treat evaluation confidence as a function of scenario volume, sample size, recency, and pass-rate stability.
- Add a go-live readiness verdict that maps hard failures and weighted quality scores into red/yellow/green.
- Build a metrics catalog with metric owner, source, formula, confidence, thresholds, and required artifacts.
- Split phone-agent metrics into conversation quality, speech/voice quality, call-control, business outcome, safety/compliance, and integration/tool reliability.
- Store every run with artifacts: transcript, audio/video if available, tool calls, webhook logs, network traces, latency samples, evaluator rationale, and RCA.
- Add production recording upload and batch analysis as a separate workflow from synthetic simulation.
- Add evaluator persona/noise/response-timing configuration for outbound and inbound simulations.
- Add CLI-triggered eval objectives and reusable skills/modules for repeatable suites.
- Add API-style result retrieval so a dashboard or external app can consume runs, task state, artifacts, and RCA.

## Source Pages

| Slug | Source | Why Captured | Screenshot |
|---|---|---|---|
| home | [TestMu AI (Formerly LambdaTest) - AI Powered Testing Tool - AI Testing Agents On Cloud](https://www.testmuai.com/) | Main positioning, IA, feature claims. | docs/research/testmuai-agent-eval-scrape/assets/home.png |
| agent-to-agent | [Agent-to-Agent Testing: Test AI Chatbots, Voice Agents & More | TestMu AI](https://www.testmuai.com/agent-to-agent-testing/) | Direct voice/chat/calling-agent eval benchmark page. | Cloudflare/security verification in headless browser |
| kane-ai | [KaneAI - World's First GenAI Test Agent | AI Testing Tool](https://www.testmuai.com/kane-ai/) | Autonomous test planning/authoring model. |  |
| kane-cli | [Kane CLI - Browser Automation Tool For Testing | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/kane-cli/) | Natural-language local-browser automation and CLI flow. | Cloudflare/security verification in headless browser |
| mcp | [TestMu AI (Formerly LambdaTest) MCP Server for Software Testing](https://www.testmuai.com/mcp/) | MCP framing for connecting agents to test data/tools. | Cloudflare/security verification in headless browser |
| test-intelligence | [AI Native Test Intelligence for Deep Test Insights | TestMu AI | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/test-intelligence/) | Analytics, failure classification, flaky tests, and insights. | Cloudflare/security verification in headless browser |
| hyperexecute | [HyperExecute - AI-Native Test Orchestration Platform | TestMu AI](https://www.testmuai.com/hyperexecute/) | Distributed orchestration and execution cloud. | Cloudflare/security verification in headless browser |
| docs-index | [TestMu AI Documentation | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/docs/) | Documentation index and taxonomy. | Cloudflare/security verification in headless browser |
| api-index | [TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/) | Public API doc taxonomy. | Cloudflare/security verification in headless browser |
| ai-agent-evaluation-blog | [AI Agent Evaluation: What Most Teams Miss [2026] | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/blog/ai-agent-evaluation/) | Background article on AI-agent evaluation framing. |  |
| agent-to-agent-launch-blog | [World’s First True AI Agent-to-Agent Testing Platform!](https://www.testmuai.com/blog/introducing-ai-agent-to-agent-testing-platform/) | Launch framing for agent-to-agent testing. |  |
| learning-hub-ai-agents | [What Are AI Agents? Components, Types and Examples](https://www.testmuai.com/learning-hub/ai-agents/) | Concept taxonomy for AI agents. |  |
| kane-cli-agent-mode-doc | [Agent Mode | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/docs/kane-cli-agent-mode/) | CLI agent-mode mechanics. |  |
| kane-cli-skills-doc | [Kane CLI Skills for AI Agents | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/docs/kane-cli-skills/) | Skill/package model for reusable agent testing behavior. |  |
| kane-cli-testmd-doc | [Test.md | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/docs/kane-cli-testmd/) | Markdown test objective format. |  |
| kane-cli-cicd-doc | [CI/CD Integration | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/docs/kane-cli-cicd/) | CI/CD execution model. |  |
| analytics-test-data-api | [Get test execution data with AI insights. — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/analytics/test-data/get-test-execution-data-with-ai-insights/) | Run-result retrieval with AI insights. |  |
| analytics-rca-api | [Get AI-powered Root Cause Analysis for test failures. — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/analytics/root-cause-analysis/get-ai-powered-root-cause-analysis-for-test-failures/) | Root-cause analysis API model. |  |
| hyperexecute-job-status-api | [Check the status of a Job and its associated Tasks. — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/hyperexecute/jobs/check-the-status-of-a-job-and-its-associated-tasks/) | Job/task status model. |  |
| hyperexecute-scenario-api | [Fetch Scenario details associated with your Job ID — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/hyperexecute/jobs/fetch-scenario-details-associated-with-your-job-id/) | Scenario detail API model. |  |
| hyperexecute-artifacts-api | [Retrieve the metadata of all artifacts generated by a job. — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/hyperexecute/artifacts/retrieve-the-metadata-of-all-artifacts-generated-by-a-job/) | Artifacts metadata model. |  |
| performance-summary-api | [Retrieve a summary of performance testing results for a specific job. — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/performance-testing/performance-testing/retrieve-a-summary-of-performance-testing-results-for-a-specific-job/) | Performance result summary model. |  |
| session-video-api | [Fetch recorded video of a test session id. — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/selenium-automation-api/session/fetch-recorded-video-of-a-test-session-id/) | Session video artifact retrieval model. |  |
| session-network-api | [Network log of a test session — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/selenium-automation-api/session/network-log-of-a-test-session/) | Session network log retrieval model. |  |
| smartui-upload-api | [Upload any locally captured images to SmartUI for visual regression testing.Maximum Upload Size:100MB — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/smart-ui/upload-screenshots/upload-any-locally-captured-images-to-smartui-for-visual-regression-testing-maximum-upload-size-100mb/) | External screenshot upload model. |  |
| test-manager-test-runs-api | [Create Test Run — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/test-manager/test-runs/create-test-run/) | Test-run creation model. |  |
| test-manager-test-cases-api | [Create Test Cases By Project ID — TestMu AI API | TestMu AI (Formerly LambdaTest)](https://www.testmuai.com/support/api-doc/test-manager/test-cases/create-test-cases-by-project-id/) | Test-case creation model. |  |

## Per-Page Extraction

### home
- URL: https://www.testmuai.com/
- Title: TestMu AI (Formerly LambdaTest) - AI Powered Testing Tool - AI Testing Agents On Cloud
- Key headings: Power Your Software Testing with AI Agents and Cloud; Pioneer of AI Agentic Testing Cloud; Autonomous AI Agents for Testing; High Performance Agentic Test Cloud; TestMuAI (Formerly LambdaTest) Unified Quality Engineering for Enterprise; Unified AI Native Test Management; Autonomous Agentic Test Planning and Authoring; An AI Agent for Testing AI Agents
- Short extracted evidence lines:
  - Power Your Software Testing with AI Agents and Cloud
  - The Native AI-Agentic Cloud Platform to Supercharge Quality Engineering. Test Intelligently and Ship Faster.
  - Pioneer of AI Agentic Testing Cloud
  - Autonomous AI Agents for Testing
  - Plan, Author, and Evolve end to end test using company wide context or simple natural language prompts. Test every layer Database, API, UI, Performance and more

### agent-to-agent
- URL: https://www.testmuai.com/agent-to-agent-testing/
- Title: Agent-to-Agent Testing: Test AI Chatbots, Voice Agents & More | TestMu AI
- Key headings: #1 Agent to Agent Testing Platform; An AI Agent for Testing AI Agents; Every Agent Type. One Platform.; Chat & Voice Agent Testing; Phone Caller Inbound Agent; Phone Caller Outbound Agent; Image Analyzer Agent; Autonomous Testing for Every Agent You Build
- Short extracted evidence lines:
  - #1 Agent to Agent Testing Platform
  - Deploy autonomous AI evaluators to test your chatbots, voice assistants, and calling agents for hallucinations, bias, toxicity, compliance, and more.
  - An AI Agent for Testing AI Agents
  - AI agents don't produce the same output twice. Agent-to-agent testing deploys an AI evaluator that engages your agent like a real user, scoring every response for accuracy, safety, and compliance.
  - Detect hallucinations and fabricated claims automatically.

### kane-ai
- URL: https://www.testmuai.com/kane-ai/
- Title: KaneAI - World's First GenAI Test Agent | AI Testing Tool
- Key headings: KaneAI - GenAI Native Testing Agent; One Agent Validates Every Layer; Test Case Scenario Generation; Smarter API Testing; Real-Time Network Checks; Pixel-Perfect Validation; Author Using Natural Language; Database-Ready Tests
- Short extracted evidence lines:
  - KaneAI - GenAI Native Testing Agent
  - One Agent Validates Every Layer
  - Test Case Scenario Generation
  - Click through the flow once. KaneAI records every action and converts it into reusable test steps.
  - Steer the Agent in Real Time

### kane-cli
- URL: https://www.testmuai.com/kane-cli/
- Title: Kane CLI - Browser Automation Tool For Testing | TestMu AI (Formerly LambdaTest)
- Key headings: Testing Tool for; Agent-Native. From Day One.; Kane CLI For Every Use Case, Any Flow; Run flows from any terminal; Multi-environment in one command; Headless or visible; Build Up Confidence Locally; Browser Automation Before Every Deploy
- Short extracted evidence lines:
  - install -g @testmuai/kane-cli
  - Agent-Native. From Day One.
  - Point Cursor to Kane CLI and let it drive real browsers. Author, run, and verify flows straight from your editor.
  - Kane CLI For Every Use Case, Any Flow
  - See exactly what Kane CLI does in visible mode while debugging. Switch to headless for CI runs without changing a single line.

### mcp
- URL: https://www.testmuai.com/mcp/
- Title: TestMu AI (Formerly LambdaTest) MCP Server for Software Testing
- Key headings: TestMu AI MCP Server
- Short extracted evidence lines:
  - MCP Server in one place, from setup to tools
  - generateHyperExecuteYAML:
  - Get instant answers from HyperExecute documentation.
  - getHyperExecuteJobSessions:
  - Fetch all session details linked to a HyperExecute job.

### test-intelligence
- URL: https://www.testmuai.com/test-intelligence/
- Title: AI Native Test Intelligence for Deep Test Insights | TestMu AI | TestMu AI (Formerly LambdaTest)
- Key headings: Turn Every Test Run Into Actionable Test Insights; AI Test Intelligence Platform That Reads Logs So You Don't; Test Insights Surfaces What Matters; Stop Triaging Logs, Start Fixing Bugs; Ask Your Test Data Anything In Plain English; Five Ways Test Intelligence Cuts Your Triage Time; Flaky Test Detection; Classify Failed Actions
- Short extracted evidence lines:
  - Turn Every Test Run Into Actionable Test Insights
  - Test Intelligence automatically triages failures, detects flaky tests, and delivers AI root cause analysis so your team fixes real bugs.
  - Test Insights Surfaces What Matters
  - AI-Native Test Insights surface what to test, what's broken, and what's at risk automatically.
  - Flaky tests scored and ranked across every CI build.

### hyperexecute
- URL: https://www.testmuai.com/hyperexecute/
- Title: HyperExecute - AI-Native Test Orchestration Platform | TestMu AI
- Key headings: AI-Native End-to-End Test Orchestration Cloud; Wide OS. Popular Frameworks. One Platform.; Smarter Tests. Faster Feedback.; Test on Real Devices; Real-Time Debugging and Test Logs; Build Quality. Measured Instantly.; Deploy Anywhere. Your Data Stays With You.; AWS Cloud
- Short extracted evidence lines:
  - HyperExecute's AI-native orchestration is
  - and outperforms legacy cloud testing platforms. For Boomi, it was no longer only about scalability but also performance.
  - Parallelize mobile testing across real Android and iOS devices with HyperExecute's intelligent orchestration.
  - Video recordings and automatic screenshots at failure points for visual debugging.
  - AI-native root cause analysis and error classification to pinpoint failures instantly.

### docs-index
- URL: https://www.testmuai.com/support/docs/
- Title: TestMu AI Documentation | TestMu AI (Formerly LambdaTest)
- Key headings: TestMu AI (Formerly LambdaTest) Documentation; Web Automation; App Automation; HyperExecute; Insights; Browser Cloud NEW; SmartUI; Web Scanner NEW
- Short extracted evidence lines:
  - Launch Session With Agent Skills
  - Setting up TestMu AI MCP Server
  - Testing Locally Hosted Pages

### api-index
- URL: https://www.testmuai.com/support/api-doc/
- Title: TestMu AI (Formerly LambdaTest)
- Key headings: 
- Short extracted evidence lines:
  - No targeted evidence lines found.

### ai-agent-evaluation-blog
- URL: https://www.testmuai.com/blog/ai-agent-evaluation/
- Title: AI Agent Evaluation: What Most Teams Miss [2026] | TestMu AI (Formerly LambdaTest)
- Key headings: AI Agent Evaluation: What Most Teams Miss [2026]; What Is AI Agent Evaluation; What Are the Benefits of AI Agent Evaluation; How to Evaluate an AI Agent; How to Build Evaluation-Driven Development Into Agent Workflow; The Agent Testing Pyramid; What Are the Key AI Agent Evaluation Metrics; What Are the Types of AI Agent Evaluation
- Short extracted evidence lines:
  - AI Agent Evaluation: What Most Teams Miss [2026] | TestMu AI (Formerly LambdaTest)
  - AI Agent Evaluation: What Most Teams Miss [2026]
  - AI agent evaluation covers the metrics, methods, and tools teams need to measure task completion, tool accuracy, and safety adherence.
  - What Is AI Agent Evaluation
  - Benefits of AI Agent Evaluation

### agent-to-agent-launch-blog
- URL: https://www.testmuai.com/blog/introducing-ai-agent-to-agent-testing-platform/
- Title: World’s First True AI Agent-to-Agent Testing Platform!
- Key headings: TestMu AI Unveils the World’s First True AI Agent-to-Agent Testing Platform!; But Why Do We Need AI to Test AI Agents?; Introducing the World’s First Agentic Testing Platform; Autonomous Test Generation at Scale; True Multi-Modal Understanding; Automated Multi-Agent Test Generation; Comprehensive Test Scenarios; Seamless Integration with HyperExecute
- Short extracted evidence lines:
  - World’s First True AI Agent-to-Agent Testing Platform!
  - TestMu AI Unveils the World’s First True AI Agent-to-Agent Testing Platform!
  - TestMu AI's Agent-to-Agent Testing Platform is the world's first solution for testing AI agents using specialized AI agents, boosting test coverage and ensuring flawless AI performance.
  - But Why Do We Need AI to Test AI Agents?
  - Introducing the World’s First Agentic Testing Platform

### learning-hub-ai-agents
- URL: https://www.testmuai.com/learning-hub/ai-agents/
- Title: What Are AI Agents? Components, Types and Examples
- Key headings: What Are AI Agents? Components, Types and Examples; What Are AI Agents?; Benefits of AI Agents; Core Components of AI Agents; How Do AI Agents Work?; Types of AI Agents; What Are Some Real-World Applications of AI Agents?; How to Use AI Agents: Example Using TestMu AI KaneAI
- Short extracted evidence lines:
  - What Are AI Agents? Components, Types and Examples
  - Explore AI agents - their benefits, core components, how they work, different types, and common challenges with real-world examples.
  - Core Components of AI Agents
  - What Are Some Real-World Applications of AI Agents?
  - How to Use AI Agents: Example Using TestMu AI KaneAI

### kane-cli-agent-mode-doc
- URL: https://www.testmuai.com/support/docs/kane-cli-agent-mode/
- Title: Agent Mode | TestMu AI (Formerly LambdaTest)
- Key headings: Agent Mode; Enable Agent Mode ​; Output Format ​; Event Schema ​; Step Events ​; Flow Events ​; The run_end Event ​; Key Fields ​
- Short extracted evidence lines:
  - kane-cli run "Verify the checkout flow completes successfully" \
  - in non-interactive environments (CI/CD, agent contexts) to avoid display server errors.
  - Kane CLI outputs one JSON object per line (NDJSON) to stdout:
  - {"type":"step_start","index":1,"objective":"Click checkout button"}
  - Agent branched into sub-flows

### kane-cli-skills-doc
- URL: https://www.testmuai.com/support/docs/kane-cli-skills/
- Title: Kane CLI Skills for AI Agents | TestMu AI (Formerly LambdaTest)
- Key headings: Kane CLI Skills for AI Agents; Install ​; Install by Agent ​; First-Time Auth in Agent Contexts ​; How Skills Work ​; Skill File Locations ​; Test across 3000+ combinations of browsers, real devices & OS.; Help and Support
- Short extracted evidence lines:
  - Kane CLI Skills for AI Agents
  - is a markdown instruction file that teaches an AI coding agent how to use
  - flag). The skill tells the agent to always use
  - The quickest way to install the Kane CLI skill globally for all supported agents (Claude Code, Codex CLI, and Gemini CLI) in one command:
  - npx @testmuai/kane-cli-skill

### kane-cli-testmd-doc
- URL: https://www.testmuai.com/support/docs/kane-cli-testmd/
- Title: Test.md | TestMu AI (Formerly LambdaTest)
- Key headings: Test.md; Quick Start ​; When to Use testmd vs run ​; File Format ​; YAML Frontmatter ​; Title and Steps ​; Per-Step Config Overrides ​; Replay and Cascade Rule ​
- Short extracted evidence lines:
  - ) and commit them to your repo. On the first run, the AI agent authors each step and saves a recording. On every subsequent run, each step
  - with no LLM cost and much faster execution. Commit the test file and its recordings to git so teammates and CI can re-run the same tests without re-authoring.
  - kane-cli testmd run amazon_test.md --agent
  - On the first run, the agent authors each step and caches the recording. On every later run, the steps replay from cache instantly.
  - is one-shot. It runs an objective, uploads results, and exits. It is ideal for quick, one-off verifications like checking if a page loads correctly or extracting a value from a live site.

### kane-cli-cicd-doc
- URL: https://www.testmuai.com/support/docs/kane-cli-cicd/
- Title: CI/CD Integration | TestMu AI (Formerly LambdaTest)
- Key headings: CI/CD Integration; Common Patterns ​; Authentication in CI/CD ​; Exit Codes ​; CI/CD Checklist ​; Platform Guides ​; Running Multiple Tests ​; Variables in CI/CD ​
- Short extracted evidence lines:
  - Kane CLI runs headlessly in CI/CD pipelines using credentials passed as environment variables or inline flags. Tests fail fast on assertion errors and return standard exit codes for pipeline control flow.
  - from CI secrets. Do not call
  - . If your runner image cannot install Chrome, point Kane CLI at a remote browser with
  - kane-cli run "Verify checkout flow completes" \
  - kane-cli run "Verify the homepage loads and the login button is visible" \

### analytics-test-data-api
- URL: https://www.testmuai.com/support/api-doc/analytics/test-data/get-test-execution-data-with-ai-insights/
- Title: Get test execution data with AI insights. — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Get test execution data with AI insights.; Authorizations; Query Parameters; Response
- Short extracted evidence lines:
  - Get test execution data with AI insights.
  - Returns paginated test execution records enriched with AI-powered insights including smart tags, flakiness metrics, and root cause analysis (RCA) category.
  - must be supplied together — providing only one returns a 400 error. The maximum allowed span per API call is
  - https://api.lambdatest.com/insights/api/v3/public
  - https://eu-api.lambdatest.com/insights/api/v3/public

### analytics-rca-api
- URL: https://www.testmuai.com/support/api-doc/analytics/root-cause-analysis/get-ai-powered-root-cause-analysis-for-test-failures/
- Title: Get AI-powered Root Cause Analysis for test failures. — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Get AI-powered Root Cause Analysis for test failures.; Authorizations; Query Parameters; Response
- Short extracted evidence lines:
  - Get AI-powered Root Cause Analysis for test failures.
  - https://api.lambdatest.com/insights/api/v3/public
  - https://eu-api.lambdatest.com/insights/api/v3/public
  - "https://api.lambdatest.com/insights/api/v3/public/rca"
  - "Because the server call failed, the expected UI element was never loaded."

### hyperexecute-job-status-api
- URL: https://www.testmuai.com/support/api-doc/hyperexecute/jobs/check-the-status-of-a-job-and-its-associated-tasks/
- Title: Check the status of a Job and its associated Tasks. — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Check the status of a Job and its associated Tasks.; Authorizations; Path Parameters; Response
- Short extracted evidence lines:
  - ](https://www.lambdatest.com/support/docs/hyperexecute-status/) of a specific [
  - ](https://www.lambdatest.com/support/docs/hyperexecute-guided-walkthrough/#jobs-page) by providing the
  - https://api.hyperexecute.cloud
  - "https://api.hyperexecute.cloud/v2.0/job/{jobID}"
  - "screenRecordingForScenarios"

### hyperexecute-scenario-api
- URL: https://www.testmuai.com/support/api-doc/hyperexecute/jobs/fetch-scenario-details-associated-with-your-job-id/
- Title: Fetch Scenario details associated with your Job ID — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Fetch Scenario details associated with your Job ID; Authorizations; Path Parameters; Query Parameters; Response
- Short extracted evidence lines:
  - Fetch Scenario details associated with your Job ID
  - This API retrieves scenario-level execution details for a given Job ID. A scenario in HyperExecute represents a logical stage or group of test cases executed within a [
  - ](https://www.lambdatest.com/support/docs/hyperexecute-guided-walkthrough/#jobs-page). Each job consists of multiple tasks, and each task may contain one or more scenarios.
  - https://api.hyperexecute.cloud
  - "https://api.hyperexecute.cloud/v2.0/job/{jobID}/scenarios"

### hyperexecute-artifacts-api
- URL: https://www.testmuai.com/support/api-doc/hyperexecute/artifacts/retrieve-the-metadata-of-all-artifacts-generated-by-a-job/
- Title: Retrieve the metadata of all artifacts generated by a job. — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Retrieve the metadata of all artifacts generated by a job.; Authorizations; Path Parameters; Response
- Short extracted evidence lines:
  - Retrieve the metadata of all artifacts generated by a job.
  - ](https://www.lambdatest.com/support/docs/hyperexecute-artifacts/) that were produced during the execution of a Job.
  - https://api.hyperexecute.cloud
  - "https://api.hyperexecute.cloud/v2.0/job/{jobID}/artefacts"

### performance-summary-api
- URL: https://www.testmuai.com/support/api-doc/performance-testing/performance-testing/retrieve-a-summary-of-performance-testing-results-for-a-specific-job/
- Title: Retrieve a summary of performance testing results for a specific job. — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Retrieve a summary of performance testing results for a specific job.; Authorizations; Path Parameters; Response
- Short extracted evidence lines:
  - Retrieve a summary of performance testing results for a specific job.
  - https://api.hyperexecute.cloud
  - "https://api.hyperexecute.cloud/v1.0/performance/summary/{jobId}"
  - Enter your HyperExecute JobID

### session-video-api
- URL: https://www.testmuai.com/support/api-doc/selenium-automation-api/session/fetch-recorded-video-of-a-test-session-id/
- Title: Fetch recorded video of a test session id. — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Fetch recorded video of a test session id.; Authorizations; Path Parameters; Query Parameters; Response
- Short extracted evidence lines:
  - No targeted evidence lines found.

### session-network-api
- URL: https://www.testmuai.com/support/api-doc/selenium-automation-api/session/network-log-of-a-test-session/
- Title: Network log of a test session — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Network log of a test session; Authorizations; Path Parameters; Response
- Short extracted evidence lines:
  - No targeted evidence lines found.

### smartui-upload-api
- URL: https://www.testmuai.com/support/api-doc/smart-ui/upload-screenshots/upload-any-locally-captured-images-to-smartui-for-visual-regression-testing-maximum-upload-size-100mb/
- Title: Upload any locally captured images to SmartUI for visual regression testing.Maximum Upload Size:100MB — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Upload any locally captured images to SmartUI for visual regression testing.Maximum Upload Size:100MB; Authorizations; Body; Response
- Short extracted evidence lines:
  - Upload any locally captured images to SmartUI for visual regression testing.Maximum Upload Size:100MB
  - Using this API you can upload any local images to our cloud comparsion. You can upload images and add their meta-data information to map the screenshots for comparsion.
  - "https://api.lambdatest.com/automation/smart-ui/v2/upload"
  - Pass your list of screenshots which needs to be uploaded for comparison. (Minimum 1 file required)

### test-manager-test-runs-api
- URL: https://www.testmuai.com/support/api-doc/test-manager/test-runs/create-test-run/
- Title: Create Test Run — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Create Test Run; Authorizations; Body; Response
- Short extracted evidence lines:
  - No targeted evidence lines found.

### test-manager-test-cases-api
- URL: https://www.testmuai.com/support/api-doc/test-manager/test-cases/create-test-cases-by-project-id/
- Title: Create Test Cases By Project ID — TestMu AI API | TestMu AI (Formerly LambdaTest)
- Key headings: Create Test Cases By Project ID; Authorizations; Body; Response
- Short extracted evidence lines:
  - No targeted evidence lines found.

