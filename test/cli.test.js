import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
test("CLI capture JSON is raw-free by default and doctor/help work", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-")); const input = join(dir, "source.json");
  writeFileSync(input, JSON.stringify({ id: "cli", locator: "fixture", raw: "PRIVATE BODY", fields: { blocker: "Needs input" } }));
  const run = (args) => spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), ...args], { encoding: "utf8" });
   const result = run(["capture", "--source", input]); const output = JSON.parse(result.stdout); assert.equal(result.status, 0); assert.equal(output.profile, "internal-evidence-pack"); assert.equal(output.candidate_claims.some((claim) => claim.source_material === "structured_fields"), true); assert.equal(result.stdout.includes("PRIVATE BODY"), false);
  assert.equal(run(["--help"]).status, 0); assert.equal(run(["capture", "--bad"]).status, 1); assert.equal(run(["doctor"]).status, 0);
});

test("CLI preserves metadata provenance while excluding confidential raw prose", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-metadata-")); const input = join(dir, "source.json");
  writeFileSync(input, JSON.stringify({ id: "cli-meta", locator: "fixture", raw: "EXACT CONFIDENTIAL PROSE", metadata: { owner: "ops" } }));
  const result = spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), "capture", "--source", input, "--profile", "internal-evidence-pack"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(result.stdout.includes("EXACT CONFIDENTIAL PROSE"), false); assert.equal(output.sources[0].metadata.owner, "ops"); assert.equal(output.candidate_claims.some((claim) => claim.source_material === "metadata"), true);
});

test("CLI candidate review can immediately export a portable candidate", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-review-"));
  const input = join(dir, "source.json");
  const packFile = join(dir, "pack.json");
  writeFileSync(input, JSON.stringify({ id: "cli-review", locator: "fixture", fields: { status: "Ready" } }));
  const run = (args) => spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), ...args], { encoding: "utf8" });
  const capture = run(["capture", "--source", input, "--profile", "internal-evidence-pack", "--out", packFile]);
  assert.equal(capture.status, 0, capture.stderr);
  const pack = JSON.parse(readFileSync(packFile, "utf8"));
  const candidateId = pack.candidate_claims.find((candidate) => candidate.source_material === "structured_fields").id;
  const reviewed = run(["candidate-review", "--pack", packFile, "--candidate-id", candidateId, "--decision", "approve-portable", "--reviewed-by", "cli", "--reviewed-at", "2026-07-20T12:00:00Z", "--profile", "portable-summary"]);
  assert.equal(reviewed.status, 0, reviewed.stderr);
  const output = JSON.parse(reviewed.stdout);
  assert.equal(output.candidate_claims.length, 1);
  assert.equal(output.candidate_claims[0].review_status, "approved_for_portable");
});
