import test from "node:test";
import assert from "node:assert/strict";
import { listCaptureTools, callCaptureTool } from "../src/mcp-tools.js";
import { buildProfileExport, createEvidencePack } from "../src/capture.js";
test("MCP exposes exactly capture tools and rejects local raw profile", async () => {
  assert.deepEqual(listCaptureTools().map((tool) => tool.name), ["capture.normalize", "capture.evidence_pack", "capture.export", "capture.candidate_review", "capture.doctor"]);
  const normalized = await callCaptureTool("capture.normalize", { source: { id: "m", raw: "PRIVATE", locator: "m" } }); assert.equal(normalized.content[0].text.includes("PRIVATE"), false);
  await assert.rejects(() => callCaptureTool("capture.evidence_pack", { sources: [{ id: "m", raw: "PRIVATE" }], profile: "raw-local-only" }), /local-only/);
});

test("MCP candidate review uses the API helper and rejects raw approval", async () => {
  const pack = createEvidencePack({ sources: [{ id: "mcp-review", locator: "mcp-review", fields: { status: "Ready" } }] });
  const candidate = pack.candidate_claims[0];
  candidate.source_material = "raw_body";
  await assert.rejects(() => callCaptureTool("capture.candidate_review", { pack, candidateId: candidate.id, decision: "approve-portable", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z" }), /forged candidate derivation/);
});

test("MCP JSON preserves metadata and derivation markers while excluding raw prose", async () => {
  const result = await callCaptureTool("capture.evidence_pack", { sources: [{ id: "mcp-meta", locator: "mcp", raw: "EXACT CONFIDENTIAL PROSE", metadata: { owner: "ops" } }], outputMode: "export", profile: "internal-evidence-pack" });
  const output = JSON.parse(result.content[0].text); assert.equal(result.content[0].text.includes("EXACT CONFIDENTIAL PROSE"), false); assert.equal(output.sources[0].metadata.owner, "ops"); assert.equal(output.candidate_claims.some((claim) => claim.derivation_version === "0.5.1" && claim.source_material === "metadata"), true);
});

test("MCP internal profile is the documented review surface for structured and metadata candidates", async () => {
  const result = await callCaptureTool("capture.evidence_pack", { sources: [{ id: "mcp-review-surface", locator: "mcp", raw: "PRIVATE RAW", fields: { status: "Ready" }, metadata: { owner: "ops" } }], outputMode: "export", profile: "internal-evidence-pack" });
  const output = JSON.parse(result.content[0].text);
  assert.equal(output.profile, "internal-evidence-pack");
  assert.deepEqual(output.candidate_claims.map((claim) => claim.source_material).sort(), ["metadata", "structured_fields"]);
  assert.equal(output.diagnostics.some((diagnostic) => diagnostic.type === "raw_body_excluded"), true);
});

test("MCP evidence pack defaults to the internal review surface", async () => {
  const result = await callCaptureTool("capture.evidence_pack", {
    sources: [{ id: "mcp-default", locator: "mcp", fields: { status: "Ready" } }]
  });
  const output = JSON.parse(result.content[0].text);
  assert.equal(output.profile, undefined);
  assert.equal(output.kind, "capture_truth_evidence_pack");
  assert.equal(output.candidate_claims.some((claim) => claim.source_material === "structured_fields"), true);
});

test("MCP validates output modes and rejects profile with pack", async () => {
  await assert.rejects(() => callCaptureTool("capture.evidence_pack", { sources: [{ id: "mode" }], outputMode: "invalid" }), /pack, export, both/);
  await assert.rejects(() => callCaptureTool("capture.evidence_pack", { sources: [{ id: "mode" }], outputMode: "pack", profile: "internal-evidence-pack" }), /only valid/);
  const pack = createEvidencePack({ sources: [{ id: "review-mode", fields: { status: "Ready" } }] });
  const candidate = pack.candidate_claims[0];
  await assert.rejects(() => callCaptureTool("capture.candidate_review", { pack, candidateId: candidate.id, decision: "reject", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z", outputMode: "invalid" }), /pack, export, both/);
  await assert.rejects(() => callCaptureTool("capture.candidate_review", { pack, candidateId: candidate.id, decision: "reject", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z", outputMode: "pack", profile: "internal-evidence-pack" }), /only valid/);
});

test("MCP candidate review preserves the historical default and supports sequential reviewed packs", async () => {
  const pack = createEvidencePack({ sources: [{ id: "mcp-sequential", locator: "mcp", fields: { status: "Ready" }, metadata: { owner: "ops" } }] });
  const structured = pack.candidate_claims.find((candidate) => candidate.source_material === "structured_fields");
  const metadata = pack.candidate_claims.find((candidate) => candidate.source_material === "metadata");
  const legacy = await callCaptureTool("capture.candidate_review", { pack, candidateId: structured.id, decision: "approve-portable", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z" });
  const legacyOutput = JSON.parse(legacy.content[0].text);
  assert.equal(legacyOutput.kind, "capture_truth_export");
  const first = await callCaptureTool("capture.candidate_review", { pack, candidateId: structured.id, decision: "approve-portable", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z", outputMode: "pack" });
  const firstPack = JSON.parse(first.content[0].text);
  const second = await callCaptureTool("capture.candidate_review", { pack: firstPack, candidateId: metadata.id, decision: "approve-portable", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z", outputMode: "pack" });
  const secondPack = JSON.parse(second.content[0].text);
  const exported = await callCaptureTool("capture.export", { pack: secondPack, profile: "portable-summary" });
  const output = JSON.parse(exported.content[0].text);
  assert.equal(output.candidate_claims.length, 2);
  assert.ok(output.candidate_claims.every((candidate) => candidate.review_status === "approved_for_portable"));
});

test("MCP candidate review both returns the reviewed_pack/export contract", async () => {
  const pack = createEvidencePack({ sources: [{ id: "mcp-both", locator: "mcp", fields: { status: "Ready" } }] });
  const candidate = pack.candidate_claims.find((entry) => entry.source_material === "structured_fields");
  const result = await callCaptureTool("capture.candidate_review", { pack, candidateId: candidate.id, decision: "approve-portable", reviewedBy: "MCP", reviewedAt: "2026-07-20T12:00:00Z", outputMode: "both", profile: "portable-summary" });
  const output = JSON.parse(result.content[0].text);
  assert.deepEqual(Object.keys(output), ["reviewed_pack", "export"]);
  assert.equal(output.reviewed_pack.kind, "capture_truth_evidence_pack");
  assert.equal(output.export.kind, "capture_truth_export");
});

test("MCP export matches the library profile projection", async () => {
  const pack = createEvidencePack({ sources: [{ id: "mcp-export", locator: "mcp", fields: { status: "Ready" } }] });
  const result = await callCaptureTool("capture.export", { pack, profile: "internal-evidence-pack" });
  assert.deepEqual(JSON.parse(result.content[0].text), buildProfileExport(pack, "internal-evidence-pack"));
});

test("MCP normalize removes raw-like aliases, nested payloads, and preserves legitimate fields", async () => {
  const result = await callCaptureTool("capture.normalize", { source: { id: "mcp-alias", locator: "mcp", raw: "RAW PROSE", fields: { status: "Ready", body: "CONFIDENTIAL BODY", nested: { payload: "NESTED" } }, metadata: { owner: "ops", content: "CONFIDENTIAL CONTENT" } } });
   const output = JSON.parse(result.content[0].text); const text = result.content[0].text; assert.match(text, /"status": "Ready"/); assert.match(text, /"owner": "ops"/); assert.equal(text.includes("RAW PROSE"), false); assert.equal(text.includes("CONFIDENTIAL"), false); assert.equal(text.includes("NESTED"), false); assert.deepEqual(output.diagnostics.filter((entry) => entry.type === "raw_body_excluded").map((entry) => entry.message), ["raw body was excluded from the normalized record at $.fields.body.", "raw body was excluded from the normalized record at $.fields.nested.payload.", "raw body was excluded from the normalized record at $.metadata.content.", "raw body was excluded from the normalized record at $.raw."]);
});

test("MCP normalize applies portable credential-prose redaction while preserving safe values", async () => {
  const result = await callCaptureTool("capture.normalize", { source: { id: "mcp-prose", locator: "mcp", access_caveats: ["Cookie: sid=7; keep this note", "safe caveat"], fields: { note: "Authorization: Bearer abc123; Cookie: sid=7; session: hidden; safe value", safe: "ordinary value" }, metadata: { note: "Cookie: sid=8; safe metadata", owner: "ops" } } });
  const output = JSON.parse(result.content[0].text);
  const text = JSON.stringify(output);
  for (const secret of ["Bearer abc123", "Cookie: sid=7", "Cookie: sid=8", "session: hidden"]) assert.equal(text.includes(secret), false, secret);
  assert.equal(output.fields.safe, "ordinary value"); assert.equal(output.metadata.owner, "ops"); assert.equal(output.access_caveats[1], "safe caveat");
});

test("MCP normalize sanitizes URL credentials in fields, caveats, and IPv6 locators", async () => {
  const result = await callCaptureTool("capture.normalize", { source: {
    id: "mcp-url", url: "https://user:pass@[2001:db8::1]/x?keep=1&oauth_token=hide#access_token=hide&safe=yes",
    locator: "https://[2001:db8::2]/doc?author=ok&tokenizer=ok&sig_v4=hide", access_caveats: ["See https://u:p@example.test/?secret=hide&ok=1 and https://safe.example.test/a?keep=2."],
    fields: { nested: { url: "https://nested.example.test/?api_key=hide&safe=1" } }, metadata: { nested: [{ link: "https://x:y@example.test/a" }] }
  } });
  const output = JSON.parse(result.content[0].text);
  assert.equal(output.url, "https://[2001:db8::1]/x?keep=1#safe=yes");
  assert.equal(output.locator, "https://[2001:db8::2]/doc?author=ok&tokenizer=ok");
  assert.match(output.access_caveats[0], /https:\/\/example\.test\/\?ok=1/); assert.match(output.access_caveats[0], /https:\/\/safe\.example\.test\/a\?keep=2/);
  assert.equal(output.fields.nested.url, "https://nested.example.test/?safe=1"); assert.equal(output.metadata.nested[0].link, "https://example.test/a");
  assert.equal(result.content[0].text.includes("hide"), false); assert.equal(result.content[0].text.includes("u:p@"), false);
});

test("MCP rejects non-http locator schemes with the same policy as the API", async () => {
  for (const scheme of ["mailto:user@example.test", "ssh://host/path", "urn:example", "javascript:alert(1)"]) {
    await assert.rejects(() => callCaptureTool("capture.normalize", { source: { id: "mcp-invalid", locator: scheme } }), /unsafe URL scheme/);
  }
});
