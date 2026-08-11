import test from "node:test";
import assert from "node:assert/strict";
import { createEvidencePack, buildProfileExport, normalizeTimestamp, EXPORT_PROFILES } from "../src/capture.js";
import { validateEvidencePack } from "../src/contracts.js";

const now = () => new Date("2026-07-19T00:00:00Z");
test("captures provenance and keyword candidate claims", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s1", type: "note", locator: "docs/a", observed_at: "2026-07-18T12:00:00+02:00", fields: { status: "Blocked" } }] });
  assert.equal(pack.schema_version, "0.4.0"); assert.equal(pack.sources[0].observed_at, "2026-07-18T10:00:00.000Z");
  assert.equal(pack.candidate_claims[0].suggested_kind, "status"); assert.equal(pack.candidate_claims[0].review_status, "unreviewed"); assert.equal(validateEvidencePack(pack).length, 0);
});
test("quality diagnostics are deterministic and invalid times do not crash capture", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s", observed_at: "2026-02-30T00:00:00Z", content_hash: "bad", fields: { blocker: "Needs input" } }, { id: "s", captured_at: "2026-07-19", fields: {} }] });
  assert.deepEqual(pack.diagnostics.map((d) => d.type), ["invalid_timestamp", "missing_source_updated_at", "missing_locator", "invalid_content_hash", "deprecated_captured_at", "invalid_timestamp", "missing_source_updated_at", "missing_locator", "duplicate_source_id"]);
});
test("profiles structurally exclude raw bodies and redact portable metadata", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s", locator: "https://x.invalid?token=sk-abcdefghijk", raw: "private body", raw_included: true, access_caveats: ["secret=abc"], metadata: { "api-key": "sk-abcdefghijk" } }] });
  for (const profile of EXPORT_PROFILES) { const output = buildProfileExport(pack, profile); if (profile !== "raw-local-only") { const text = JSON.stringify(output); assert.equal(text.includes("private body"), false); assert.equal(text.includes("sk-abcdefghijk"), false); assert.equal(output.diagnostics.some((d) => d.type === "redaction_applied"), true); } else assert.equal(JSON.stringify(output).includes("private body"), true); }
  assert.throws(() => buildProfileExport(pack, "raw-local-only", { portable: true }), /local/);
});
test("timestamp normalization rejects timezone-free and impossible values", () => { assert.equal(normalizeTimestamp("2026-07-19"), "2026-07-19"); assert.equal(normalizeTimestamp("2026-02-30T00:00:00Z"), "2026-02-30T00:00:00Z"); });
test("provided hashes remain exact and duplicate candidates are diagnosed", () => {
  const hash = "sha256:" + "a".repeat(64); const pack = createEvidencePack({ now, sources: [{ id: "a", content_hash: hash, fields: { blocker: "Same" } }, { id: "a", content_hash: hash, fields: { blocker: "Same" } }] });
  assert.equal(pack.sources[0].content_hash, hash); assert.equal(pack.candidate_claims.length, 1); assert.equal(pack.diagnostics.some((d) => d.type === "duplicate_candidate_id"), true); assert.equal(validateEvidencePack(pack).length, 0);
});
test("portable source refs retain the canonical provenance allowlist only", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "ref", locator: "loc", path: "docs/x", url: "https://example.test/x", observed_at: "2026-07-19T00:00:00Z", source_updated_at: "2026-07-18T00:00:00Z", revision: 3, content_hash: "sha256:" + "b".repeat(64), fields: { blocker: "Needs input" } }] });
  const ref = buildProfileExport(pack, "internal-evidence-pack").candidate_claims[0].source_refs[0]; assert.deepEqual(Object.keys(ref).sort(), ["content_hash", "locator", "observed_at", "path", "revision", "source_id", "source_updated_at", "url"].sort()); assert.equal(Object.hasOwn(ref, "unknown"), false);
});
test("custom canonical SourceRef fields survive while unknown fields are removed", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "custom", locator: "c", fields: { status: "Ready" } }] });
  pack.candidate_claims[0].source_refs[0] = { source_id: "custom", locator: "c", note: "supports", path: "docs/c", url: "https://example.test/c", observed_at: "2026-07-19T00:00:00Z", source_updated_at: "2026-07-18T00:00:00Z", revision: 4, content_hash: "sha256:" + "c".repeat(64), heading: "Status", tableRow: 2, line: 7, text: "status: Ready", unknown: "drop" };
  const ref = buildProfileExport(pack, "internal-evidence-pack").candidate_claims[0].source_refs[0]; assert.equal(ref.note, "supports"); assert.equal(ref.heading, "Status"); assert.equal(ref.tableRow, 2); assert.equal(ref.line, 7); assert.equal(ref.text, "status: Ready"); assert.equal(Object.hasOwn(ref, "unknown"), false);
});
test("evidence-pack validation rejects wrong versions and unknown claim/ref properties", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "v", locator: "v", fields: { status: "Ready" } }] }); const wrong = { ...pack, schema_version: "9.9.9" }; assert.ok(validateEvidencePack(wrong).some((error) => error.includes("schema_version")));
  const unknown = structuredClone(pack); unknown.candidate_claims[0].extra = true; unknown.candidate_claims[0].source_refs[0].extra = true; assert.ok(validateEvidencePack(unknown).some((error) => error.includes("unknown canonical")));
});
test("compound sensitive metadata keys are removed with their values, while safe metadata survives", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "meta", locator: "m", metadata: { password_hint: "not-a-pattern-secret", apiToken: "plain-token", nested: { private_key: "plain-key", team: "ops" }, retention: "30d" } }] });
  const output = JSON.stringify(buildProfileExport(pack, "internal-evidence-pack")); assert.equal(output.includes("not-a-pattern-secret"), false); assert.equal(output.includes("plain-token"), false); assert.equal(output.includes("plain-key"), false); assert.equal(output.includes('"team":"ops"'), true); assert.equal(output.includes('"retention":"30d"'), true); assert.equal(output.includes("redaction_applied"), true);
});
