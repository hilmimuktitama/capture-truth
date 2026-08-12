import test from "node:test";
import assert from "node:assert/strict";
import { listCaptureTools, callCaptureTool } from "../src/mcp-tools.js";
test("MCP exposes exactly capture tools and rejects local raw profile", async () => {
  assert.deepEqual(listCaptureTools().map((tool) => tool.name), ["capture.normalize", "capture.evidence_pack", "capture.doctor"]);
  const normalized = await callCaptureTool("capture.normalize", { source: { id: "m", raw: "PRIVATE", locator: "m" } }); assert.equal(normalized.content[0].text.includes("PRIVATE"), false);
  await assert.rejects(() => callCaptureTool("capture.evidence_pack", { sources: [{ id: "m", raw: "PRIVATE" }], profile: "raw-local-only" }), /local-only/);
});

test("MCP JSON preserves metadata and derivation markers while excluding raw prose", async () => {
  const result = await callCaptureTool("capture.evidence_pack", { sources: [{ id: "mcp-meta", locator: "mcp", raw: "EXACT CONFIDENTIAL PROSE", metadata: { owner: "ops" } }], profile: "internal-evidence-pack" });
  const output = JSON.parse(result.content[0].text); assert.equal(result.content[0].text.includes("EXACT CONFIDENTIAL PROSE"), false); assert.equal(output.sources[0].metadata.owner, "ops"); assert.equal(output.candidate_claims.some((claim) => claim.derivation_version === "0.4.1" && claim.source_material === "metadata"), true);
});

test("MCP normalize removes raw-like aliases, nested payloads, and preserves legitimate fields", async () => {
  const result = await callCaptureTool("capture.normalize", { source: { id: "mcp-alias", locator: "mcp", raw: "RAW PROSE", fields: { status: "Ready", body: "CONFIDENTIAL BODY", nested: { payload: "NESTED" } }, metadata: { owner: "ops", content: "CONFIDENTIAL CONTENT" } } });
  const text = result.content[0].text; assert.match(text, /"status": "Ready"/); assert.match(text, /"owner": "ops"/); assert.equal(text.includes("RAW PROSE"), false); assert.equal(text.includes("CONFIDENTIAL"), false); assert.equal(text.includes("NESTED"), false);
});
