import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

test("packed installed package exposes MCP tools and refuses raw-local-only", async () => {
  const temp = mkdtempSync(join(tmpdir(), "capture-truth-packed-"));
  try {
    const packed = spawnSync("npm", ["pack", "--pack-destination", temp, "--silent"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr); const tarball = join(temp, packed.stdout.trim().split(/\r?\n/).at(-1)); const install = join(temp, "install");
    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--prefix", install, tarball], { encoding: "utf8" }); assert.equal(installed.status, 0, installed.stderr);
     const binary = join(install, "node_modules", ".bin", "capture-truth-mcp"); const responses = await exercise(binary); const listing = responses.find((response) => response.id === 2); const refusal = responses.find((response) => response.id === 3); assert.deepEqual(listing.result.tools.map((tool) => tool.name), ["capture.normalize", "capture.evidence_pack", "capture.candidate_review", "capture.doctor"]); assert.equal(refusal.result.isError, true); assert.match(refusal.result.content[0].text, /local-only/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("packed CLI supports candidate review followed by portable export", () => {
  const temp = mkdtempSync(join(tmpdir(), "capture-truth-packed-cli-"));
  try {
    const packed = spawnSync("npm", ["pack", "--pack-destination", temp, "--silent"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr);
    const tarball = join(temp, packed.stdout.trim().split(/\r?\n/).at(-1));
    const install = join(temp, "install");
    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--prefix", install, tarball], { encoding: "utf8" });
    assert.equal(installed.status, 0, installed.stderr);
    const binary = join(install, "node_modules", ".bin", "capture-truth");
    const source = join(temp, "source.json");
    const pack = join(temp, "pack.json");
    writeFileSync(source, JSON.stringify({ id: "packed-cli", locator: "fixture", fields: { status: "Ready" } }));
    const capture = spawnSync(binary, ["capture", "--source", source, "--profile", "internal-evidence-pack", "--out", pack], { encoding: "utf8" });
    assert.equal(capture.status, 0, capture.stderr);
    const candidateId = JSON.parse(readFileSync(pack, "utf8")).candidate_claims[0].id;
    const reviewed = spawnSync(binary, ["candidate-review", "--pack", pack, "--candidate-id", candidateId, "--decision", "approve-portable", "--reviewed-by", "packed-cli", "--reviewed-at", "2026-07-20T12:00:00Z", "--profile", "portable-summary"], { encoding: "utf8" });
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.equal(JSON.parse(reviewed.stdout).candidate_claims.length, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

async function exercise(binary) {
  const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] }); let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "packed-test", version: "1" } } })}\n`);
    await waitFor(() => output.includes('"id":1'), 3000); child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`); await waitFor(() => output.includes("capture.evidence_pack"), 3000);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "capture.evidence_pack", arguments: { sources: [{ id: "raw", raw: "PRIVATE" }], profile: "raw-local-only" } } })}\n`); await waitFor(() => output.includes('"id":3'), 3000); return output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } finally { if (!child.killed) child.kill(); }
}
function waitFor(predicate, timeout) { return new Promise((resolve, reject) => { const start = Date.now(); const timer = setInterval(() => { if (predicate()) { clearInterval(timer); resolve(); } else if (Date.now() - start > timeout) { clearInterval(timer); reject(new Error("Timed out waiting for packed MCP response.")); } }, 20); }); }
