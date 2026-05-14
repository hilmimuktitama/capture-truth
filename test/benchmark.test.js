import test from "node:test";
import assert from "node:assert/strict";

import { runBenchmarkFixture } from "../src/benchmark.js";

test("benchmark fixture returns deterministic conflict and repo-safe export outputs", () => {
  const result = runBenchmarkFixture();

  assert.equal(result.mode, "capture-truth-benchmark-fixture");
  assert.equal(result.scenario, "stale-local-note-vs-fresh-jira");
  assert.equal(result.evidence_pack.sources.length, 3);
  assert.equal(result.evidence_pack.conflicts.length, 2);
  assert.equal(result.validation.ok, false);
  assert.equal(result.validation.conflicts.some((conflict) => conflict.conflict_type === "date_mismatch"), true);
  assert.equal(result.validation.gaps.some((gap) => gap.type === "stale_source"), true);
  assert.match(result.repo_safe_summary, /Export profile: repo-safe-summary/);
  assert.match(result.repo_safe_summary, /Redaction warnings/);
  assert.doesNotMatch(result.repo_safe_summary, /secret=abc123/);
  assert.deepEqual(result.expected_findings, [
    "stale local note should not override fresher Jira evidence",
    "DEMO-2944 date conflict should be emitted as date_mismatch",
    "DOCS-7550 readiness conflict should be emitted as claim_disagreement",
    "repo-safe summary should omit raw source bodies and sensitive values"
  ]);
});
