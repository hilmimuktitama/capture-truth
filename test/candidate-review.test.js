import test from "node:test";
import assert from "node:assert/strict";
import { buildProfileExport, createEvidencePack, reviewCandidateClaim } from "../src/capture.js";
import { validateCandidateClaim, validateEvidencePack } from "../src/contracts.js";

const now = () => new Date("2026-07-19T00:00:00Z");
const reviewedAt = "2026-07-20T12:00:00Z";

function fixturePack() {
  return createEvidencePack({ now, sources: [{ id: "review-source", locator: "review-source", fields: { status: "Ready" }, metadata: { owner: "ops" } }] });
}

test("extraction emits unreviewed candidates without review metadata", () => {
  const pack = fixturePack();
  assert.ok(pack.candidate_claims.length >= 2);
  assert.ok(pack.candidate_claims.every((candidate) => candidate.review_status === "unreviewed"));
  assert.ok(pack.candidate_claims.every((candidate) => !Object.hasOwn(candidate, "reviewed_by") && !Object.hasOwn(candidate, "reviewed_at")));
});

test("review requires reviewer and timestamp and persists through JSON", () => {
  const pack = fixturePack();
  const candidateId = pack.candidate_claims.find((candidate) => candidate.source_material === "structured_fields").id;
  assert.throws(() => reviewCandidateClaim(pack, { candidateId, decision: "approve-portable", reviewedAt }), /reviewedBy/);
  assert.throws(() => reviewCandidateClaim(pack, { candidateId, decision: "approve-portable", reviewedBy: "Ada", reviewedAt: "tomorrow" }), /RFC3339/);
  const reviewed = reviewCandidateClaim(pack, { candidateId, decision: "approve-portable", reviewedBy: "Ada", reviewedAt });
  const roundTripped = JSON.parse(JSON.stringify(reviewed));
  const candidate = roundTripped.candidate_claims.find((entry) => entry.id === candidateId);
  assert.equal(candidate.review_status, "approved_for_portable");
  assert.equal(candidate.reviewed_by, "Ada");
  assert.equal(candidate.reviewed_at, reviewedAt);
  assert.equal(validateCandidateClaim(candidate).length, 0);
  assert.equal(validateEvidencePack(roundTripped).length, 0);
  assert.equal(pack.candidate_claims.find((entry) => entry.id === candidateId).review_status, "unreviewed");
});

test("sequential review preserves prior decisions and excludes rejection", () => {
  const pack = fixturePack();
  const structured = pack.candidate_claims.find((candidate) => candidate.source_material === "structured_fields");
  const metadata = pack.candidate_claims.find((candidate) => candidate.source_material === "metadata");
  const first = reviewCandidateClaim(pack, { candidateId: structured.id, decision: "approve-portable", reviewedBy: "Ada", reviewedAt });
  const second = reviewCandidateClaim(first, { candidateId: metadata.id, decision: "reject", reviewedBy: "Ada", reviewedAt });
  assert.equal(second.candidate_claims.find((candidate) => candidate.id === structured.id).review_status, "approved_for_portable");
  assert.equal(second.candidate_claims.find((candidate) => candidate.id === metadata.id).review_status, "rejected");
  const output = buildProfileExport(JSON.parse(JSON.stringify(second)), "portable-summary");
  assert.deepEqual(output.candidate_claims.map((candidate) => candidate.id), [structured.id]);
});

test("approval validates the complete pack and refuses raw or mixed derivations", () => {
  const pack = fixturePack();
  const candidate = pack.candidate_claims.find((entry) => entry.source_material === "structured_fields");
  const forgedPack = structuredClone(pack);
  forgedPack.candidate_claims.find((entry) => entry.id === candidate.id).source_refs[0].locator = "forged";
  assert.throws(() => reviewCandidateClaim(forgedPack, { candidateId: candidate.id, decision: "approve-portable", reviewedBy: "Ada", reviewedAt }), /forged candidate derivation/);

  const rawPack = createEvidencePack({ now, sources: [{ id: "raw-review", locator: "raw-review", raw: "private: prose", raw_included: true }] });
  const raw = rawPack.candidate_claims.find((entry) => entry.source_material === "raw_body");
  assert.throws(() => reviewCandidateClaim(rawPack, { candidateId: raw.id, decision: "approve-portable", reviewedBy: "Ada", reviewedAt }), /raw_body/);
});

test("portable export includes approved structured and metadata, excluding raw and rejected", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "profile-source", locator: "profile-source", raw: "CONFIDENTIAL RAW PROSE", raw_included: true, fields: { status: "Ready" }, metadata: { owner: "ops" } }] });
  const structured = pack.candidate_claims.find((candidate) => candidate.source_material === "structured_fields");
  const metadata = pack.candidate_claims.find((candidate) => candidate.source_material === "metadata");
  const raw = pack.candidate_claims.find((candidate) => candidate.source_material === "raw_body");
  const approved = reviewCandidateClaim(pack, { candidateId: structured.id, decision: "approve-portable", reviewedBy: "Ada", reviewedAt });
  const approvedBoth = reviewCandidateClaim(approved, { candidateId: metadata.id, decision: "approve-portable", reviewedBy: "Ada", reviewedAt });
  const reviewed = reviewCandidateClaim(approvedBoth, { candidateId: raw.id, decision: "reject", reviewedBy: "Ada", reviewedAt });
  const output = buildProfileExport(reviewed, "portable-summary");
  assert.deepEqual(output.candidate_claims.map((candidate) => candidate.text).sort(), ["owner: ops", "status: Ready"]);
  assert.equal(JSON.stringify(output).includes("CONFIDENTIAL RAW PROSE"), false);
  assert.equal(output.summary.omission_reasons.candidate_raw_body_excluded, 1);
});

test("internal profile omits reviewed candidates", () => {
  const pack = fixturePack();
  const candidate = pack.candidate_claims.find((entry) => entry.source_material === "structured_fields");
  const reviewed = reviewCandidateClaim(pack, { candidateId: candidate.id, decision: "reject", reviewedBy: "Ada", reviewedAt });
  const output = buildProfileExport(reviewed, "internal-evidence-pack");
  assert.equal(output.candidate_claims.some((entry) => entry.text === candidate.text), false);
  assert.equal(output.candidate_claims.some((entry) => entry.source_material === "metadata"), true);
});

test("raw-local-only includes raw material but refuses portable output", () => {
  const pack = createEvidencePack({ now, sources: [{ id: "local", locator: "local", raw: "LOCAL RAW", raw_included: true }] });
  const output = buildProfileExport(pack, "raw-local-only", { portable: false });
  assert.equal(output.local_only, true);
  assert.equal(JSON.stringify(output).includes("LOCAL RAW"), true);
  assert.throws(() => buildProfileExport(pack, "raw-local-only", { portable: true }), /refused portable/);
});

test("repo-safe-summary is a deprecated alias with equivalent safe content", () => {
  const pack = fixturePack();
  const portable = buildProfileExport(pack, "portable-summary");
  const alias = buildProfileExport(pack, "repo-safe-summary");
  const comparableAlias = {
    ...alias,
    diagnostics: alias.diagnostics.filter((entry) => entry.type !== "deprecated_repo_safe_summary"),
    summary: { ...alias.summary, diagnostic_count: portable.summary.diagnostic_count }
  };
  assert.deepEqual(comparableAlias, portable);
  assert.equal(alias.diagnostics.some((entry) => entry.type === "deprecated_repo_safe_summary"), true);
});
