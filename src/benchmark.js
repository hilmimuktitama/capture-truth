import { createConfluenceCompactAdapter, createJiraCompactAdapter } from "./adapters.js";
import { createEvidencePack, renderEvidencePack, validateEvidencePack } from "./evidence-pack.js";

const BENCHMARK_NOW = "2026-05-14T00:00:00Z";

export function runBenchmarkFixture() {
  const sources = createBenchmarkSources();
  const evidencePack = createEvidencePack({ sources, extraction_profile: "benchmark" });
  const validation = validateEvidencePack(evidencePack);
  const repoSafeSummary = renderEvidencePack(evidencePack, {
    format: "markdown",
    export_profile: "repo-safe-summary"
  });

  return {
    mode: "capture-truth-benchmark-fixture",
    scenario: "stale-local-note-vs-fresh-jira",
    generated_at: BENCHMARK_NOW,
    input_summary: {
      source_count: sources.length,
      source_ids: sources.map((source) => source.id)
    },
    evidence_pack: evidencePack,
    validation,
    repo_safe_summary: repoSafeSummary,
    expected_findings: [
      "stale local note should not override fresher Jira evidence",
      "TF-2944 date conflict should be emitted as date_mismatch",
      "BIF-7550 readiness conflict should be emitted as claim_disagreement",
      "repo-safe summary should omit raw source bodies and sensitive values"
    ]
  };
}

export function renderBenchmarkFixture(result = runBenchmarkFixture()) {
  const lines = [
    "# Capture Truth Benchmark Fixture",
    "",
    `Scenario: ${result.scenario}`,
    `Sources: ${result.input_summary.source_count}`,
    `Conflicts: ${result.validation.conflicts.length}`,
    `Gaps: ${result.validation.gaps.length}`,
    "",
    "## Expected Findings"
  ];

  for (const finding of result.expected_findings) {
    lines.push(`- ${finding}`);
  }

  lines.push("", "## Repo-Safe Summary", "", result.repo_safe_summary.trim());
  return `${lines.join("\n")}\n`;
}

function createBenchmarkSources() {
  const jira = createJiraCompactAdapter({
    now: () => new Date(BENCHMARK_NOW),
    freshWithinDays: 3
  });
  const confluence = createConfluenceCompactAdapter({
    now: () => new Date(BENCHMARK_NOW),
    freshWithinDays: 7
  });

  return [
    {
      id: "local-note",
      type: "text",
      path: "notes/status-2026-05-01.md",
      adapter: "direct",
      captured_at: "2026-05-01T00:00:00Z",
      freshness: "stale",
      content: [
        "TF-2944 real-client start date is 2026-05-27.",
        "title: BIF-7550 readiness is ready.",
        "Customer token secret=abc123 must remain local."
      ].join("\n")
    },
    jira.read({
      key: "TF-2944",
      summary: "TF-2944 real-client start date is 2026-06-02.",
      status: "In Progress",
      assignee: "Platform",
      updated_at: "2026-05-13T12:00:00Z",
      url: "https://example.atlassian.net/browse/TF-2944"
    }),
    confluence.read({
      id: "BIF-7550",
      title: "BIF-7550 readiness is not ready",
      space: "TPM",
      status: "current",
      version: 12,
      updated_at: "2026-05-13T10:00:00Z",
      url: "https://example.atlassian.net/wiki/spaces/TPM/pages/BIF-7550"
    })
  ];
}
