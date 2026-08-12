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
  const result = run(["capture", "--source", input]); assert.equal(result.status, 0); assert.equal(result.stdout.includes("PRIVATE BODY"), false);
  assert.equal(run(["--help"]).status, 0); assert.equal(run(["capture", "--bad"]).status, 1); assert.equal(run(["doctor"]).status, 0);
});

test("CLI preserves metadata provenance while excluding confidential raw prose", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-truth-metadata-")); const input = join(dir, "source.json");
  writeFileSync(input, JSON.stringify({ id: "cli-meta", locator: "fixture", raw: "EXACT CONFIDENTIAL PROSE", metadata: { owner: "ops" } }));
  const result = spawnSync(process.execPath, [join(root, "bin/capture-truth.js"), "capture", "--source", input, "--profile", "internal-evidence-pack"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(result.stdout.includes("EXACT CONFIDENTIAL PROSE"), false); assert.equal(output.sources[0].metadata.owner, "ops"); assert.equal(output.candidate_claims.some((claim) => claim.source_material === "metadata"), true);
});
