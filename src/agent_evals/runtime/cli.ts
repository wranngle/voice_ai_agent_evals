import {loadSettings} from '../config';
import {createFileConversationRepository} from '../repo';
import {
  SystemClock,
  StderrSink,
  createFileSink,
  createJsonLogger,
  NoopMetricsSink,
  createPrometheusMetricsSink,
} from '../providers';
import {createEvaluator} from '../service';
import {renderResultsMarkdown} from '../ui';
import {
  defaultBaselinePath,
  notifySinkFromEnv,
  readBaseline,
  writeBaseline,
} from '../../notify';

async function main(): Promise<void> {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    process.stderr.write('usage: bun run src/agent_evals/runtime/cli.ts <conversations.json>\n');
    process.exit(2);
  }

  const settings = loadSettings();
  const repository = createFileConversationRepository(fixturePath);
  const sink = settings.logFile ? createFileSink(settings.logFile) : StderrSink;
  const logger = createJsonLogger(sink);
  const metrics = settings.metricsEndpoint
    ? createPrometheusMetricsSink({endpoint: settings.metricsEndpoint})
    : NoopMetricsSink;
  const evaluator = createEvaluator({
    repository,
    rules: {
      maxTurnDurationMs: settings.maxTurnDurationMs,
      minAgentTurnRatio: settings.minAgentTurnRatio,
    },
    clock: SystemClock,
    logger,
    metrics,
  });
  const results = evaluator.evaluateAll();
  process.stdout.write(renderResultsMarkdown(results));

  if (settings.metricsEndpoint) {
    try {
      await metrics.flush();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`metrics flush failed: ${message}\n`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const notifySink = notifySinkFromEnv(process.env);
  if (notifySink !== undefined && process.env.VOICE_EVALS_NOTIFY_WEBHOOK_URL) {
    const baselinePath = defaultBaselinePath(process.env);
    const previous = readBaseline(baselinePath);
    const delta = previous === undefined ? undefined : passed - previous.passed;
    try {
      await notifySink.report({passed, total, delta});
      writeBaseline(baselinePath, {passed, total});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`notify webhook failed: ${message}\n`);
    }
  }

  const failed = total - passed;
  process.exit(failed === 0 ? 0 : 1);
}

void main();
