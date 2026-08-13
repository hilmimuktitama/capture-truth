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
   const result = run(["capture", "--source", input, "--output-mode", "export", "--profile", "internal-evidence-pack"]); const output = JSON.parse(result.stdout); assert.equal(result.status, 0); assert.equal(output.profile, "internal-evidence-pack"); assert.equal(output.candidate_claims.some((claim) => claim.source_material === "structured_fields"), true); assert.equal(result.stdout.includes("PRIVATE BODY"), false);
  assert.equal(run(["--help"]).status, 0); assert.equal(run(["capture", "--bad"]).status, 1); assert.equal(run(["doctor"]).status, 0);
});

test("CLI supports pack, export, both, and profile gating", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-modes-")); const input = join(dir, "source.json");
  writeFileSync(input, JSON.stringify({ id: "modes", locator: "fixture", fields: { status: "Ready", owner: "ops" } }));
  const run = (args) => spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), ...args], { encoding: "utf8" });
  const pack = run(["capture", "--source", input]); assert.equal(pack.status, 0, pack.stderr); assert.equal(JSON.parse(pack.stdout).kind, "capture_truth_evidence_pack");
  const both = run(["capture", "--source", input, "--output-mode", "both", "--profile", "internal-evidence-pack"]); const bothOutput = JSON.parse(both.stdout); assert.equal(both.status, 0, both.stderr); assert.ok(bothOutput.pack); assert.equal(bothOutput.export.profile, "internal-evidence-pack");
  const rejected = run(["capture", "--source", input, "--profile", "internal-evidence-pack"]); assert.equal(rejected.status, 1);
  const packFile = join(dir, "pack.json"); writeFileSync(packFile, pack.stdout);
  const exported = run(["export", "--pack", packFile, "--profile", "internal-evidence-pack"]); assert.equal(exported.status, 0, exported.stderr); assert.equal(JSON.parse(exported.stdout).profile, "internal-evidence-pack");
  const invalidMode = run(["capture", "--source", input, "--output-mode", "invalid"]); assert.equal(invalidMode.status, 1); assert.match(invalidMode.stderr, /pack, export, both/);
});

test("CLI raw-local-only export is explicitly local and retains raw material", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-raw-local-")); const input = join(dir, "source.json");
  writeFileSync(input, JSON.stringify({ id: "raw-local", locator: "fixture", raw: "LOCAL PRIVATE BODY", raw_included: true }));
  const run = (args) => spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), ...args], { encoding: "utf8" });
  const result = run(["capture", "--source", input, "--output-mode", "export", "--profile", "raw-local-only"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.profile, "raw-local-only"); assert.equal(output.portable, false); assert.equal(output.local_only, true); assert.match(result.stdout, /LOCAL PRIVATE BODY/);
});

test("CLI preserves metadata provenance while excluding confidential raw prose", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-metadata-")); const input = join(dir, "source.json");
  writeFileSync(input, JSON.stringify({ id: "cli-meta", locator: "fixture", raw: "EXACT CONFIDENTIAL PROSE", metadata: { owner: "ops" } }));
   const result = spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), "capture", "--source", input, "--output-mode", "export", "--profile", "internal-evidence-pack"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(result.stdout.includes("EXACT CONFIDENTIAL PROSE"), false); assert.equal(output.sources[0].metadata.owner, "ops"); assert.equal(output.candidate_claims.some((claim) => claim.source_material === "metadata"), true);
});

test("CLI sequential candidate review uses reviewed packs and exports both approved candidates", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-review-"));
  const input = join(dir, "source.json");
  const packFile = join(dir, "pack.json");
  const firstReviewedFile = join(dir, "reviewed-one.json");
  const secondReviewedFile = join(dir, "reviewed-two.json");
  writeFileSync(input, JSON.stringify({ id: "cli-review", locator: "fixture", fields: { status: "Ready" }, metadata: { owner: "ops" } }));
  const run = (args) => spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), ...args], { encoding: "utf8" });
  const capture = run(["capture", "--source", input, "--out", packFile]);
  assert.equal(capture.status, 0, capture.stderr);
  const pack = JSON.parse(readFileSync(packFile, "utf8"));
  const candidateId = pack.candidate_claims.find((candidate) => candidate.source_material === "structured_fields").id;
  const first = run(["candidate-review", "--pack", packFile, "--candidate-id", candidateId, "--decision", "approve-portable", "--reviewed-by", "cli", "--reviewed-at", "2026-07-20T12:00:00Z", "--output-mode", "pack", "--out", firstReviewedFile]);
  assert.equal(first.status, 0, first.stderr);
  const firstPack = JSON.parse(readFileSync(firstReviewedFile, "utf8"));
  const secondId = firstPack.candidate_claims.find((candidate) => candidate.source_material === "metadata")?.id ?? firstPack.candidate_claims.find((candidate) => candidate.id !== candidateId).id;
  const second = run(["candidate-review", "--pack", firstReviewedFile, "--candidate-id", secondId, "--decision", "approve-portable", "--reviewed-by", "cli", "--reviewed-at", "2026-07-20T12:00:00Z", "--output-mode", "pack", "--out", secondReviewedFile]);
  assert.equal(second.status, 0, second.stderr);
  const exported = run(["export", "--pack", secondReviewedFile, "--profile", "portable-summary"]);
  assert.equal(exported.status, 0, exported.stderr);
  const output = JSON.parse(exported.stdout);
  assert.equal(output.candidate_claims.length, 2);
  assert.ok(output.candidate_claims.every((candidate) => candidate.review_status === "approved_for_portable"));
});
