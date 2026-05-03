import { loadSettings } from "../config";
import { createFileConversationRepository } from "../repo";
import {
  SystemClock,
  StderrSink,
  createFileSink,
  createJsonLogger,
  NoopMetricsSink,
  createOtlpHttpMetricsSink,
} from "../providers";
import { createEvaluator } from "../service";
import { renderResultsMarkdown } from "../ui";

async function main(): Promise<void> {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    process.stderr.write(
      "usage: bun run src/runtime/cli.ts <conversations.json>\n",
    );
    process.exit(2);
  }
  const settings = loadSettings();
  const repository = createFileConversationRepository(settings, fixturePath);
  const sink = settings.logFile ? createFileSink(settings.logFile) : StderrSink;
  const logger = createJsonLogger(sink);
  const metrics = settings.otlpEndpoint
    ? createOtlpHttpMetricsSink({ endpoint: settings.otlpEndpoint })
    : NoopMetricsSink;
  const evaluator = createEvaluator(
    repository,
    {
      maxTurnDurationMs: settings.maxTurnDurationMs,
      minAgentTurnRatio: settings.minAgentTurnRatio,
    },
    SystemClock,
    logger,
    metrics,
  );
  const results = evaluator.evaluateAll();
  process.stdout.write(renderResultsMarkdown(results));

  if (settings.otlpEndpoint) {
    try {
      await metrics.flush();
    } catch (error) {
      process.stderr.write(`metrics flush failed: ${(error as Error).message}\n`);
    }
  }

  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed === 0 ? 0 : 1);
}

void main();
