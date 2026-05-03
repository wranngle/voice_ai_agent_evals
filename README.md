# voice_ai_agent_evals

> eval runner enforcing sub-second latency budgets and catching regressions for the example-agent sdr.

[![License](https://img.shields.io/github/license/example/voice_ai_agent_evals?color=A371F7)](./LICENSE) ![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## Quick start

```bash
git clone https://github.com/example/voice_ai_agent_evals.git
cd voice_ai_agent_evals
bun install
```

## What it does

Test runner and scenario framework for evaluating ElevenLabs voice agents. It uses seeded synthetic transcripts and recorded audio fixtures to enforce deterministic test conditions. The runner tracks explicit latency budgets for time-to-first-byte and total conversational turn duration. It catches regressions before they reach live callers.

## Usage

```bash
bun test
bun test --mock
bun test --filter barge-in-mid-question
```

## License

See [LICENSE](./LICENSE).
