import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { runTruthTool } from "../src/truth-tools.js";
import { callTruthTool, listTruthTools } from "../src/truth-mcp-tools.js";

const INTAKE = {
  sources: [
    {
      id: "jira-tf-2944",
      type: "text",
      adapter: "jira",
      key: "DEMO-2944",
      captured_at: "2026-05-14T02:00:00Z",
      freshness: "fresh",
      content: "DEMO-2944 is blocked by API owner gap. Contact demo@example.invalid for token Bearer REDACTED_EXAMPLE."
    }
  ]
};

test("truth-tools CLI exposes capture dot commands", () => {
  const result = spawnSync(
    process.execPath,
    ["bin/truth-tools.js", "capture.create", "--json-out"],
    {
      cwd: process.cwd(),
      input: JSON.stringify(INTAKE),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.kind, "evidence_pack");
  assert.equal(parsed.sources[0].key, "DEMO-2944");
});

test("truth-tools doctor verifies install, schema, render, and MCP surfaces", () => {
  const report = runTruthTool("doctor", { all: true });

  assert.equal(report.kind, "truth_tools_doctor");
  assert.equal(report.ok, true);
  const checkNames = report.checks.map((check) => check.name);
  assert.equal(checkNames.includes("install"), true);
  assert.equal(checkNames.includes("schema"), true);
  assert.equal(checkNames.includes("render"), true);
  assert.equal(checkNames.includes("mcp"), true);
});

test("benchmark fixture mode compares with-tools and without-tools runs", () => {
  const result = runTruthTool("benchmark.fixture", {
    case_id: "bifrost-readiness",
    with_tools: {
      conflicts: [{ conflict_type: "status_mismatch" }],
      unknowns: [{ text: "Phase 2 date TBC" }]
    },
    without_tools: {
      conflicts: [],
      unknowns: []
    }
  });

  assert.equal(result.kind, "truth_tools_benchmark_fixture");
  assert.equal(result.case_id, "bifrost-readiness");
  assert.equal(result.comparison.conflicts_delta, 1);
  assert.equal(result.comparison.unknowns_delta, 1);
  assert.equal(result.recommended_use, "Use fixture to compare the same case with tools versus without tools.");
});

test("aggregate MCP surface exposes capture, program, timeline, and doctor tools", () => {
  const names = listTruthTools().map((tool) => tool.name);

  assert.deepEqual(names, [
    "capture.create",
    "capture.validate",
    "capture.render",
    "program.reconcile",
    "timeline.create",
    "timeline.validate",
    "timeline.render",
    "benchmark.fixture",
    "truth_tools.doctor"
  ]);

  const created = JSON.parse(
    callTruthTool("capture.create", INTAKE).content[0].text
  );
  assert.equal(created.kind, "evidence_pack");
});

test("repo-safe rendering redacts sensitive claims before export", () => {
  const pack = runTruthTool("capture.create", INTAKE);
  const markdown = runTruthTool("capture.render", {
    evidence_pack: pack,
    format: "markdown",
    export_profile: "repo-safe-summary"
  });

  assert.match(markdown, /Export profile: repo-safe-summary/);
  assert.doesNotMatch(markdown, /demo@example.invalid/);
  assert.doesNotMatch(markdown, /Bearer REDACTED_EXAMPLE/);
});
