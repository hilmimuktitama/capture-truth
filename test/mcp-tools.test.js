import test from "node:test";
import assert from "node:assert/strict";

import { callCaptureTool, listCaptureTools } from "../src/mcp-tools.js";

test("lists the capture-truth MCP tool surface", () => {
  const names = listCaptureTools().map((tool) => tool.name);

  assert.deepEqual(names, [
    "create_evidence_pack",
    "validate_evidence_pack",
    "render_evidence_pack",
    "refine_evidence_pack",
    "run_capture_benchmark_fixture"
  ]);
});

test("calls create, validate, render, and refine tools", () => {
  const created = JSON.parse(
    callCaptureTool("create_evidence_pack", {
      sources: [
        {
          id: "note",
          type: "text",
          captured_at: "2026-05-12T14:00:00Z",
          freshness: "fresh",
          content: "Owner TPM captured source intake by 2026-05-13."
        }
      ]
    }).content[0].text
  );

  assert.equal(created.kind, "evidence_pack");

  const validation = JSON.parse(
    callCaptureTool("validate_evidence_pack", { evidence_pack: created }).content[0].text
  );
  assert.equal(validation.ok, true);

  const markdown = callCaptureTool("render_evidence_pack", {
    evidence_pack: created,
    format: "markdown"
  }).content[0].text;
  assert.match(markdown, /Owner TPM captured source intake/);

  const safeMarkdown = callCaptureTool("render_evidence_pack", {
    evidence_pack: {
      ...created,
      sources: [
        {
          ...created.sources[0],
          content: "Fixture credential api_key=REDACTED_EXAMPLE should not leave local evidence."
        }
      ]
    },
    format: "markdown",
    export_profile: "repo-safe-summary"
  }).content[0].text;
  assert.match(safeMarkdown, /Export profile: repo-safe-summary/);
  assert.doesNotMatch(safeMarkdown, /abc123/);

  const refined = JSON.parse(
    callCaptureTool("refine_evidence_pack", {
      evidence_pack: created,
      updates: [{ matchId: created.claims[0].id, set: { classification: "action" } }]
    }).content[0].text
  );
  assert.equal(refined.claims[0].classification, "action");
});

test("calls benchmark fixture tool", () => {
  const result = JSON.parse(callCaptureTool("run_capture_benchmark_fixture").content[0].text);

  assert.equal(result.mode, "capture-truth-benchmark-fixture");
  assert.equal(result.evidence_pack.conflicts.length, 2);
  assert.match(result.repo_safe_summary, /Export profile: repo-safe-summary/);
});
