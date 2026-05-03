import type { EvaluationResult } from "../types";

export function renderResultsMarkdown(results: EvaluationResult[]): string {
  if (results.length === 0) {
    return "# Agent Evaluation\n\nNo conversations evaluated.\n";
  }
  const lines: string[] = ["# Agent Evaluation", ""];
  const passed = results.filter((r) => r.passed).length;
  lines.push(`Summary: ${passed}/${results.length} conversations passed.`, "");
  for (const result of results) {
    const verdict = result.passed ? "PASS" : "FAIL";
    lines.push(`## ${result.conversationId} — ${verdict}`);
    lines.push(`Evaluated: ${result.evaluatedAt}`);
    lines.push("");
    for (const finding of result.findings) {
      const flag = finding.passed ? "✓" : "✗";
      lines.push(`- ${flag} ${finding.rule}: ${finding.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
