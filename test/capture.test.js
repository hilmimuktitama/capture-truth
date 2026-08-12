import test from "node:test";
import assert from "node:assert/strict";
import { createEvidencePack, buildProfileExport, normalizeTimestamp, EXPORT_PROFILES } from "../src/capture.js";
import { validateEvidencePack } from "../src/contracts.js";

const now = () => new Date("2026-07-19T00:00:00Z");
test("captures provenance and keyword candidate claims", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s1", type: "note", locator: "docs/a", observed_at: "2026-07-18T12:00:00+02:00", fields: { status: "Blocked" } }] });
  assert.equal(pack.schema_version, "0.4.1"); assert.equal(pack.sources[0].observed_at, "2026-07-18T10:00:00.000Z");
  assert.equal(pack.candidate_claims[0].suggested_kind, "status"); assert.equal(pack.candidate_claims[0].review_status, "unreviewed"); assert.equal(pack.candidate_claims[0].derivation_version, "0.4.1"); assert.equal(pack.candidate_claims[0].source_material, "structured_fields"); assert.equal(validateEvidencePack(pack).length, 0);
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
  pack.candidate_claims[0].source_refs[0] = { source_id: "custom", locator: "c", note: "supports", path: null, url: null, observed_at: pack.sources[0].observed_at, source_updated_at: null, revision: null, content_hash: pack.sources[0].content_hash, heading: "Status", tableRow: 2, line: 7, text: "status: Ready", unknown: "drop" };
  const rejected = buildProfileExport(pack, "internal-evidence-pack"); assert.equal(rejected.candidate_claims.length, 0); assert.equal(rejected.diagnostics.some((diagnostic) => diagnostic.type === "invalid_candidate_derivation"), true);
});
test("evidence-pack validation rejects wrong versions and unknown claim/ref properties", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "v", locator: "v", fields: { status: "Ready" } }] }); const wrong = { ...pack, schema_version: "9.9.9" }; assert.ok(validateEvidencePack(wrong).some((error) => error.includes("schema_version")));
  const unknown = structuredClone(pack); unknown.candidate_claims[0].extra = true; unknown.candidate_claims[0].source_refs[0].extra = true; assert.ok(validateEvidencePack(unknown).some((error) => error.includes("unknown canonical")));
});
test("compound sensitive metadata keys are removed with their values, while safe metadata survives", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "meta", locator: "m", metadata: { password_hint: "not-a-pattern-secret", apiToken: "plain-token", nested: { private_key: "plain-key", team: "ops" }, retention: "30d" } }] });
  const output = JSON.stringify(buildProfileExport(pack, "internal-evidence-pack")); assert.equal(output.includes("not-a-pattern-secret"), false); assert.equal(output.includes("plain-token"), false); assert.equal(output.includes("plain-key"), false); assert.equal(output.includes('"team":"ops"'), true); assert.equal(output.includes('"retention":"30d"'), true); assert.equal(output.includes("redaction_applied"), true);
});

test("candidate derivation survives serialization and applies conservative material policy", () => {
  const confidential = "Quarterly customer escalation: exact confidential prose with no secret-like token.";
  const pack = createEvidencePack({ now, sources: [{ id: "materials", locator: "m", raw: confidential, fields: { status: "Ready" }, metadata: { owner: "ops" } }] });
  const roundTripped = JSON.parse(JSON.stringify(pack));
  assert.deepEqual(roundTripped.candidate_claims.map((claim) => [claim.derivation_version, claim.source_material]), [["0.4.1", "raw_body"], ["0.4.1", "structured_fields"], ["0.4.1", "metadata"]]);
  const portable = buildProfileExport(roundTripped, "internal-evidence-pack");
  assert.equal(portable.candidate_claims.some((claim) => claim.text === confidential), false);
  assert.equal(portable.candidate_claims.some((claim) => claim.source_material === "structured_fields"), true);
  assert.equal(portable.candidate_claims.some((claim) => claim.source_material === "metadata"), true);
  assert.equal(portable.diagnostics.some((diagnostic) => diagnostic.type === "candidate_raw_body_excluded" || diagnostic.type === "forged_candidate_derivation"), true);
});

test("mixed derivations are excluded unless explicit portable review is supplied", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "mixed", locator: "mixed", raw: "status: Ready", raw_included: true, fields: { status: "Ready" } }] });
  assert.equal(pack.candidate_claims[0].source_material, "mixed");
  assert.equal(buildProfileExport(JSON.parse(JSON.stringify(pack)), "repo-safe-summary").candidate_claims.length, 0);
  const forged = structuredClone(pack.candidate_claims[0]); forged.source_material = "structured_fields";
  assert.equal(buildProfileExport({ ...pack, candidate_claims: [forged] }, "repo-safe-summary").candidate_claims.length, 0);
});

test("missing or unknown derivation metadata is invalid and excluded from portable output", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "legacy", locator: "legacy", fields: { status: "Ready" } }] });
  const legacy = structuredClone(pack.candidate_claims[0]); delete legacy.derivation_version; delete legacy.source_material;
  assert.ok(validateEvidencePack({ ...pack, candidate_claims: [legacy] }).some((error) => error.includes("derivation_version")));
  const output = buildProfileExport({ ...pack, candidate_claims: [legacy] }, "repo-safe-summary");
  assert.equal(output.candidate_claims.length, 0); assert.equal(output.diagnostics.some((diagnostic) => diagnostic.type === "invalid_candidate_derivation"), true);
  const unknown = structuredClone(pack.candidate_claims[0]); unknown.source_material = "unknown";
  assert.ok(validateEvidencePack({ ...pack, candidate_claims: [unknown] }).some((error) => error.includes("source_material")));
});

test("raw-derived confidential prose stays excluded despite forged override attempts", () => {
  const exact = "Board-only confidential prose without a secret-like token.";
  const pack = createEvidencePack({ now, sources: [{ id: "private", locator: "private", raw: exact, raw_included: true }] });
  const forged = structuredClone(pack.candidate_claims.find((claim) => claim.text === exact)); forged.source_material = "structured_fields";
  const output = buildProfileExport({ ...pack, candidate_claims: [forged] }, "internal-evidence-pack");
  assert.equal(JSON.stringify(output).includes(exact), false); assert.equal(output.diagnostics.some((diagnostic) => diagnostic.type === "forged_candidate_derivation"), true);
});

test("raw-like aliases and nested payloads cannot become portable candidates", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "aliases", locator: "aliases", fields: { status: "Ready", body: "CONFIDENTIAL BODY", nested: { payload: "NESTED CONFIDENTIAL" } }, metadata: { owner: "ops", content: "CONFIDENTIAL CONTENT", nested: { raw: "NESTED RAW" } } }] });
  const texts = pack.candidate_claims.map((claim) => claim.text).join(" "); assert.match(texts, /status: Ready/); assert.match(texts, /owner: ops/); assert.equal(texts.includes("CONFIDENTIAL"), false);
  const portable = JSON.stringify(buildProfileExport(pack, "internal-evidence-pack")); assert.equal(portable.includes("CONFIDENTIAL"), false); assert.equal(portable.includes("NESTED"), false);
});

test("malformed optional candidate and forged source reference values are rejected", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "ref-check", locator: "loc", fields: { status: "Ready" } }] });
  const malformed = structuredClone(pack.candidate_claims[0]); malformed.suggested_kind = 4; malformed.extracted_at = "not-a-date";
  assert.ok(validateEvidencePack({ ...pack, candidate_claims: [malformed] }).some((error) => error.includes("invalid type") || error.includes("RFC3339")));
  const forged = structuredClone(pack.candidate_claims[0]); forged.source_refs[0].locator = "other"; forged.source_refs[0].content_hash = "sha256:" + "f".repeat(64);
  const output = buildProfileExport({ ...pack, candidate_claims: [forged] }, "repo-safe-summary"); assert.equal(output.candidate_claims.length, 0); assert.equal(output.diagnostics.some((diagnostic) => diagnostic.type === "forged_candidate_derivation"), true);
});
