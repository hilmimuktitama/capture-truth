import test from "node:test";
import assert from "node:assert/strict";
import { listCaptureTools, callCaptureTool } from "../src/mcp-tools.js";
test("MCP exposes exactly capture tools and rejects local raw profile", async () => {
  assert.deepEqual(listCaptureTools().map((tool) => tool.name), ["capture.normalize", "capture.evidence_pack", "capture.doctor"]);
  const normalized = await callCaptureTool("capture.normalize", { source: { id: "m", raw: "PRIVATE", locator: "m" } }); assert.equal(normalized.content[0].text.includes("PRIVATE"), false);
  await assert.rejects(() => callCaptureTool("capture.evidence_pack", { sources: [{ id: "m", raw: "PRIVATE" }], profile: "raw-local-only" }), /local-only/);
});
