import test from "node:test";
import assert from "node:assert/strict";
import { createEvidencePack, buildProfileExport, normalizeTimestamp, EXPORT_PROFILES, reviewCandidateClaim } from "../src/capture.js";
import { validateCanonicalSource, validateEvidencePack, validateProfileExport, validateSourceRef } from "../src/contracts.js";
import { isCredentialKey, rawLikeKey } from "../src/redaction.js";

const now = () => new Date("2026-07-19T00:00:00Z");
test("captures provenance and keyword candidate claims", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s1", type: "note", locator: "docs/a", observed_at: "2026-07-18T12:00:00+02:00", fields: { status: "Blocked" } }] });
   assert.equal(pack.schema_version, "0.5.1"); assert.equal(pack.sources[0].observed_at, "2026-07-18T10:00:00.000Z");
  assert.equal(pack.candidate_claims[0].suggested_kind, "status"); assert.equal(pack.candidate_claims[0].review_status, "unreviewed"); assert.equal(pack.candidate_claims[0].derivation_version, "0.5.1"); assert.equal(pack.candidate_claims[0].source_material, "structured_fields"); assert.equal(validateEvidencePack(pack).length, 0);
});
test("quality diagnostics are deterministic and invalid times do not crash capture", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s", observed_at: "2026-02-30T00:00:00Z", content_hash: "bad", fields: { blocker: "Needs input" } }, { id: "s", captured_at: "2026-07-19", fields: {} }] });
  assert.deepEqual(pack.diagnostics.map((d) => d.type), ["invalid_timestamp", "missing_source_updated_at", "missing_locator", "invalid_content_hash", "deprecated_captured_at", "invalid_timestamp", "missing_source_updated_at", "missing_locator", "duplicate_source_id"]);
});
test("profiles structurally exclude raw bodies and redact portable metadata", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "s", locator: "https://x.invalid?token=sk-abcdefghijk", raw: "private body", raw_included: true, access_caveats: ["secret=abc"], metadata: { "api-key": "sk-abcdefghijk" } }] });
  for (const profile of EXPORT_PROFILES) { const output = buildProfileExport(pack, profile); assert.deepEqual(validateProfileExport(output), []); if (profile !== "raw-local-only") { const text = JSON.stringify(output); assert.equal(text.includes("private body"), false); assert.equal(text.includes("sk-abcdefghijk"), false); assert.equal(output.diagnostics.some((d) => d.type === "redaction_applied"), true); } else assert.equal(JSON.stringify(output).includes("private body"), true); }
  assert.throws(() => buildProfileExport(pack, "raw-local-only", { portable: true }), /local/);
});
test("profile flags are profile-specific and tampering is rejected", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "flags", locator: "flags", fields: { status: "Ready" } }] });
  for (const profile of EXPORT_PROFILES) {
    const output = buildProfileExport(pack, profile);
    assert.equal(output.portable, profile !== "raw-local-only");
    assert.equal(output.local_only, profile === "raw-local-only");
    assert.deepEqual(validateProfileExport(output), []);
    for (const key of ["portable", "local_only"]) {
      const tampered = { ...output, [key]: !output[key] };
      assert.ok(validateProfileExport(tampered).some((error) => error.includes(key)));
    }
  }
  const raw = buildProfileExport(createEvidencePack({ now, sources: [{ id: "raw-flags", locator: "raw-flags", raw: "PRIVATE", raw_included: true }] }), "raw-local-only");
  assert.ok(validateProfileExport({ ...raw, portable: true, local_only: false }).some((error) => error.includes("raw-local-only") || error.includes("raw material")));
});
test("timestamp normalization rejects timezone-free and impossible values", () => { assert.equal(normalizeTimestamp("2026-07-19"), "2026-07-19"); assert.equal(normalizeTimestamp("2026-02-30T00:00:00Z"), "2026-02-30T00:00:00Z"); });
test("provided hashes remain exact and duplicate candidates are diagnosed", () => {
  const hash = "sha256:" + "a".repeat(64); const pack = createEvidencePack({ now, sources: [{ id: "a", content_hash: hash, fields: { blocker: "Same" } }, { id: "a", content_hash: hash, fields: { blocker: "Same" } }] });
  assert.equal(pack.sources[0].content_hash, hash); assert.equal(pack.candidate_claims.length, 1); assert.equal(pack.diagnostics.some((d) => d.type === "duplicate_candidate_id"), true); assert.ok(validateEvidencePack(pack).some((error) => error.includes("duplicate source id")));
});
test("portable source refs retain the canonical provenance allowlist only", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "ref", locator: "loc", path: "docs/x", url: "https://example.test/x", observed_at: "2026-07-19T00:00:00Z", source_updated_at: "2026-07-18T00:00:00Z", revision: 3, content_hash: "sha256:" + "b".repeat(64), fields: { blocker: "Needs input" } }] });
  const ref = buildProfileExport(pack, "internal-evidence-pack").candidate_claims[0].source_refs[0]; assert.deepEqual(Object.keys(ref).sort(), ["content_hash", "locator", "observed_at", "path", "revision", "source_id", "source_updated_at", "url"].sort()); assert.equal(Object.hasOwn(ref, "unknown"), false);
});
test("full canonical SourceRef fields are accepted, then narrowed from portable summary", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "custom", locator: "c", fields: { status: "Ready" } }] });
  pack.candidate_claims[0].source_refs[0] = { source_id: "custom", locator: "c", note: "supports", path: null, url: null, observed_at: pack.sources[0].observed_at, source_updated_at: null, revision: null, content_hash: pack.sources[0].content_hash, heading: "Status", tableRow: 2, line: 7 };
  assert.deepEqual(validateSourceRef(pack.candidate_claims[0].source_refs[0]), []);
  assert.deepEqual(validateEvidencePack(pack), []);
  const reviewed = reviewCandidateClaim(pack, { candidateId: pack.candidate_claims[0].id, decision: "approve-portable", reviewedBy: "Ada", reviewedAt: "2026-07-20T12:00:00Z" });
  const portable = buildProfileExport(reviewed, "portable-summary");
  assert.equal(Object.hasOwn(portable.candidate_claims[0].source_refs[0], "note"), false);
  assert.equal(Object.hasOwn(portable.candidate_claims[0].source_refs[0], "heading"), false);
  assert.equal(Object.hasOwn(portable.candidate_claims[0].source_refs[0], "tableRow"), false);
  assert.equal(Object.hasOwn(portable.candidate_claims[0].source_refs[0], "line"), false);
  const internal = buildProfileExport(pack, "internal-evidence-pack");
  assert.equal(internal.candidate_claims[0].source_refs[0].note, "supports");
  assert.equal(internal.candidate_claims[0].source_refs[0].heading, "Status");
});

test("runtime validators enforce recursive canonical bounds", () => {
  const base = { id: "bounds", type: "record", observed_at: "2026-07-19T00:00:00Z", access_caveats: Array.from({ length: 20 }, () => "x".repeat(512)), fields: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field_${i}`, ["x".repeat(2048)] ])) };
  assert.deepEqual(validateCanonicalSource(base), []);
  assert.ok(validateCanonicalSource({ ...base, access_caveats: [...base.access_caveats, "x"] }).some((error) => error.includes("access_caveats") && error.includes("at most 20")));
  assert.ok(validateCanonicalSource({ ...base, access_caveats: ["x".repeat(513)] }).some((error) => error.includes("at most 512")));
  assert.ok(validateCanonicalSource({ ...base, fields: { ...base.fields, extra: "x" } }).some((error) => error.includes("at most 100 propert")));
  assert.ok(validateCanonicalSource({ ...base, fields: { ...base.fields, nested: ["x".repeat(2049)] } }).some((error) => error.includes("at most 2048")));
  assert.ok(validateCanonicalSource({ ...base, revision: "r".repeat(2049) }).some((error) => error.includes("revision") && error.includes("at most 2048")));
  const ref = { source_id: "s".repeat(2048), locator: "l".repeat(2048), note: "n".repeat(2048), heading: "h".repeat(2048), tableRow: 1, line: 1 };
  assert.deepEqual(validateSourceRef(ref), []);
  assert.ok(validateSourceRef({ ...ref, note: "n".repeat(2049) }).some((error) => error.includes("note") && error.includes("at most 2048")));
  assert.ok(validateSourceRef({ ...ref, locator: "l".repeat(2049) }).some((error) => error.includes("locator") && error.includes("at most 2048")));
  assert.ok(validateSourceRef({ ...ref, revision: "r".repeat(2049) }).some((error) => error.includes("revision") && error.includes("at most 2048")));
});

test("duplicate candidate ids are rejected by pack validation and export", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "duplicate-candidates", locator: "d", fields: { status: "Ready", owner: "ops" } }] });
  const duplicate = structuredClone(pack.candidate_claims[0]);
  const invalid = { ...pack, candidate_claims: [...pack.candidate_claims, duplicate], summary: { ...pack.summary, candidate_claim_count: pack.candidate_claims.length + 1 } };
  assert.ok(validateEvidencePack(invalid).some((error) => error.includes("duplicate candidate id")));
  assert.throws(() => buildProfileExport(invalid, "internal-evidence-pack"), /invalid evidence pack/);
});

test("raw-key matching uses canonical exact and token aliases without false positives", () => {
  for (const key of ["body", "RAW_CONTENT", "rawContent", "rawcontent", "document", "data", "contents", "text", "description", "message", "html", "markdown", "prose", "blob", "description_markdown", "body_text", "nested_payload"]) assert.equal(rawLikeKey(key), true, key);
  for (const key of ["database", "metadata", "data_source", "context_id", "tokenizer"]) assert.equal(rawLikeKey(key), false, key);
});

test("credential matching covers bare session variants across keys, URLs, and prose", () => {
  for (const key of ["session", "session_key", "sessionKey", "session-token", "session_id", "sessionId"]) assert.equal(isCredentialKey(key), true, key);
  for (const key of ["session_name", "sessionizer", "metadata"]) assert.equal(isCredentialKey(key), false, key);
  const pack = createEvidencePack({ now, sources: [{ id: "session-secrets", locator: "https://example.test/?session_key=hidden&keep=yes", metadata: {
    session: "metadata-secret", session_key: "metadata-secret-2", sessionKey: "metadata-secret-3", safe_session_name: "ordinary label"
  }, fields: {
    note: "session: prose-secret; session_key=prose-secret-2; https://example.test/?session=hidden&keep=yes"
  } }] });
  const output = JSON.stringify(buildProfileExport(pack, "internal-evidence-pack"));
  for (const secret of ["metadata-secret", "metadata-secret-2", "metadata-secret-3", "prose-secret", "prose-secret-2", "session_key=hidden", "session=hidden"]) assert.equal(output.includes(secret), false, secret);
  assert.equal(output.includes("ordinary label"), true);
});

test("canonical raw aliases are excluded and diagnosed consistently", () => {
  for (const key of ["raw", "raw_body", "raw_content", "rawContent", "rawcontent", "document", "data", "contents", "text", "description", "message", "html", "markdown", "prose", "blob"]) {
    const pack = createEvidencePack({ now, sources: [{ id: `raw-${key}`, locator: key, [key]: "CONFIDENTIAL RAW ALIAS" }] });
    assert.equal(pack.diagnostics.some((entry) => entry.type === "raw_body_excluded"), true, key);
    assert.equal(pack.candidate_claims.every((claim) => claim.source_material === "raw_body"), true, key);
    assert.equal(JSON.stringify(buildProfileExport(pack, "internal-evidence-pack")).includes("CONFIDENTIAL RAW ALIAS"), false, key);
  }
});
test("evidence-pack validation rejects wrong versions and unknown claim/ref properties", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "v", locator: "v", fields: { status: "Ready" } }] }); const wrong = { ...pack, schema_version: "9.9.9" }; assert.ok(validateEvidencePack(wrong).some((error) => error.includes("schema_version")));
  const unknown = structuredClone(pack); unknown.candidate_claims[0].extra = true; unknown.candidate_claims[0].source_refs[0].extra = true; assert.ok(validateEvidencePack(unknown).some((error) => error.includes("unknown canonical")));
});
test("compound sensitive metadata keys are removed with their values, while safe metadata survives", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "meta", locator: "m", metadata: { password_hint: "not-a-pattern-secret", apiToken: "plain-token", nested: { private_key: "plain-key", team: "ops" }, retention: "30d" } }] });
  const output = JSON.stringify(buildProfileExport(pack, "internal-evidence-pack")); assert.equal(output.includes("not-a-pattern-secret"), false); assert.equal(output.includes("plain-token"), false); assert.equal(output.includes("plain-key"), false); assert.equal(output.includes('"team":"ops"'), true); assert.equal(output.includes('"retention":"30d"'), true); assert.equal(output.includes("redaction_applied"), true);
});

test("portable URLs remove userinfo and credential query parameters while retaining safe URL parts", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "url-secrets", url: "https://alice:password@example.test/api?keep=1&api_key=plain-api-key&filter%5Btoken%5D=plain-token#status", locator: "https://bob:secret@example.test/source?ok=yes&signature_v2=plain-signature", metadata: { nested: { url: "https://nested.example.test/?password=plain-password&safe=1" } }, fields: { status: "Ready" } }] });
  const output = buildProfileExport(pack, "internal-evidence-pack");
  const source = output.sources[0]; const ref = output.candidate_claims[0].source_refs[0];
  assert.equal(source.url, "https://example.test/api?keep=1#status"); assert.equal(source.locator, "https://example.test/source?ok=yes");
  assert.equal(ref.url, source.url); assert.equal(ref.locator, source.locator);
  assert.equal(output.sources[0].metadata.nested.url, "https://nested.example.test/?safe=1");
  assert.equal(JSON.stringify(output).includes("password"), false); assert.equal(JSON.stringify(output).includes("plain-token"), false); assert.equal(output.diagnostics.some((diagnostic) => diagnostic.type === "redaction_applied"), true);
});

test("portable URL sanitization covers source and reference paths", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "path-url", path: "https://user:pass@example.test/nested?token=hide&keep=1#secret=hide", locator: "path-url", fields: { status: "Ready" } }] });
  const output = buildProfileExport(pack, "internal-evidence-pack");
  assert.equal(output.sources[0].path, "https://example.test/nested?keep=1");
  assert.equal(output.candidate_claims[0].source_refs[0].path, output.sources[0].path);
});

test("portable URL redaction handles fragments, nested URLs, malformed encoding, and safe key names", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "url-edge", url: "https://u:p@[2001:db8::1]/x?author=ok&tokenizer=ok&sig_v4=hide&nested=https%3A%2F%2Fa%3Ab%40nested.test%2Fp%3Fkeep%3D1#access_token=hide&safe=yes", locator: "https://example.test/?bad=%E0%A4%A&keep=1", access_caveats: ["Open https://u:p@example.test/a?secret=hide&ok=1 or https://safe.test/?keep=2."], fields: { status: "Ready", link: "See https://x:y@embedded.test/?password=hide&safe=1" } }] });
  const output = buildProfileExport(pack, "internal-evidence-pack"); const source = output.sources[0]; const claimText = output.candidate_claims.find((claim) => claim.text.startsWith("link:"))?.text;
   assert.equal(source.url, "https://[2001:db8::1]/x?author=ok&tokenizer=ok"); assert.equal(source.locator, "https://example.test/?keep=1");
  assert.match(source.access_caveats[0], /https:\/\/example\.test\/a\?ok=1/); assert.match(source.access_caveats[0], /https:\/\/safe\.test\/\?keep=2/);
  assert.equal(claimText, "link: See https://embedded.test/?safe=1"); assert.equal(JSON.stringify(output).includes("hide"), false); assert.equal(JSON.stringify(output).includes("u:p@"), false);
});

test("portable candidate text sanitizes fully percent-encoded credential URLs without decoding safe prose", () => {
  const encoded = "https%3A%2F%2Fu%3Ap%40example.test%2Fapi%3Ftoken%3Dhidden%26keep%3D1";
  const safe = "A literal percent note: 100%25 complete.";
  const pack = createEvidencePack({ now, sources: [{ id: "encoded", fields: { note: `See ${encoded}`, safe } }] });
  const output = buildProfileExport(pack, "internal-evidence-pack");
  const note = output.candidate_claims.find((claim) => claim.text.startsWith("note:"));
  const safeClaim = output.candidate_claims.find((claim) => claim.text.startsWith("safe:"));
  assert.equal(note.text, `note: See ${encodeURIComponent("https://example.test/api?keep=1")}`);
  assert.equal(safeClaim.text, `safe: ${safe}`);
  assert.equal(JSON.stringify(output).includes("u%3Ap%40"), false);
});

test("candidate derivation survives serialization and applies conservative material policy", () => {
  const confidential = "Quarterly customer escalation: exact confidential prose with no secret-like token.";
  const pack = createEvidencePack({ now, sources: [{ id: "materials", locator: "m", raw: confidential, fields: { status: "Ready" }, metadata: { owner: "ops" } }] });
  const roundTripped = JSON.parse(JSON.stringify(pack));
   assert.deepEqual(roundTripped.candidate_claims.map((claim) => [claim.derivation_version, claim.source_material]), [["0.5.1", "raw_body"], ["0.5.1", "structured_fields"], ["0.5.1", "metadata"]]);
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
  assert.throws(() => buildProfileExport({ ...pack, candidate_claims: [legacy] }, "repo-safe-summary"), /invalid evidence pack/);
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

test("runtime source validation recursively enforces raw keys, types, and URL shape", () => {
  const source = { id: "schema-runtime", type: "record", observed_at: "2026-07-19T00:00:00Z", fields: { nested: { SAFE: "ok", RAW_BODY: "private" } } };
  assert.ok(validateCanonicalSource(source).some((error) => error.includes("raw-like")));
  const invalid = { ...source, url: "javascript:alert(1)", fields: { count: { bad: undefined } } };
  assert.ok(validateCanonicalSource(invalid).some((error) => error.includes("HTTP(S) URL")));
});

test("credential matcher covers canonical and encoded nested key variants", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "keys", locator: "keys", metadata: { "x-api-key": "one", x_api_key: "two", AWSAccessKeyId: "three", client_assertion: "four", access_key: "five", cookie: "six", nested: { "api-key": "seven" } }, fields: { status: "Ready" } }] });
  const output = buildProfileExport(pack, "internal-evidence-pack");
  assert.equal(JSON.stringify(output).includes("one"), false);
  assert.equal(JSON.stringify(output).includes("seven"), false);
});

test("approved structured candidate text redacts short header and session credentials", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "candidate-secrets", locator: "candidate-secrets", fields: {
    status: "Authorization: x",
    note: "Cookie: sid=7; Bearer z; session: q"
  } }] });
  for (const candidate of pack.candidate_claims) {
    candidate.review_status = "approved_for_portable";
    candidate.reviewed_by = "reviewer";
    candidate.reviewed_at = "2026-07-20T12:00:00Z";
  }
  const output = buildProfileExport(pack, "portable-summary");
  const text = JSON.stringify(output);
  assert.equal(text.includes("Authorization: x"), false);
  assert.equal(text.includes("Cookie: sid=7"), false);
  assert.equal(text.includes("Bearer z"), false);
  assert.equal(text.includes("session: q"), false);
  assert.ok(output.candidate_claims.some((candidate) => candidate.text.includes("[REDACTED]")));
  assert.deepEqual(validateProfileExport(output), []);
});

test("locator and path schemes reject non-http URL-shaped values but allow ids and paths", () => {
  for (const scheme of ["mailto:user@example.test", "ssh://host/path", "urn:example", "javascript:alert(1)"]) {
    assert.throws(() => createEvidencePack({ now, sources: [{ id: scheme, locator: scheme }] }), /unsafe URL scheme/);
  }
  assert.doesNotThrow(() => createEvidencePack({ now, sources: [{ id: "file-id", locator: "docs/file.md", path: "C:\\tmp\\file.md" }] }));
});
