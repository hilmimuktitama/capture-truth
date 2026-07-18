import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJiraCompactAdapter, createLocalFileAdapter } from "../src/adapters.js";
import {
  createEvidencePack,
  refineEvidencePack,
  renderEvidencePack,
  validateEvidencePack
} from "../src/evidence-pack.js";
import { reconcileProgram } from "../src/program-status.js";
import { createTimeline, validateTimeline } from "../src/timeline.js";

const NOW = () => new Date("2026-05-14T00:00:00Z");

test("validation rejects malformed metadata, duplicate claims, and dangling refs", () => {
  const pack = createEvidencePack({
    now: NOW,
    sources: [{ id: "s", captured_at: "not-a-date", freshness: "banana", content: "A supported statement." }]
  });
  pack.claims.push({ ...pack.claims[0], source_refs: [{ source_id: "missing" }] });

  const result = validateEvidencePack(pack, { now: NOW });
  const types = new Set(result.gaps.map((gap) => gap.type));
  assert.equal(result.ok, false);
  assert.equal(types.has("invalid_captured_at"), true);
  assert.equal(types.has("invalid_freshness"), true);
  assert.equal(types.has("duplicate_claim_id"), true);
  assert.equal(types.has("dangling_source_ref"), true);
  assert.equal(types.has("missing_source_locator"), true);
});

test("internal and repo-safe exports remove secrets from derived fields", () => {
  const pack = createEvidencePack({
    now: NOW,
    sources: [{
      id: "secret-source",
      captured_at: "2026-05-13T00:00:00Z",
      freshness: "fresh",
      content: "API token=supersecret-value."
    }]
  });

  const internal = renderEvidencePack(pack, { format: "json", export_profile: "internal-evidence-pack" });
  const repoSafe = renderEvidencePack(pack, { format: "json", export_profile: "repo-safe-summary" });
  assert.doesNotMatch(internal, /supersecret-value/);
  assert.doesNotMatch(repoSafe, /supersecret-value/);
  assert.equal(JSON.parse(internal).exports, undefined);
  assert.equal(JSON.parse(repoSafe).claims, undefined);
});

test("unreviewed observations remain candidates and negated blockers are not blockers", () => {
  const pack = createEvidencePack({
    now: NOW,
    sources: [{
      id: "note",
      captured_at: "2026-05-13T00:00:00Z",
      freshness: "fresh",
      content: "Meeting notes\nAPI is not blocked.\nLaunch approval is recorded."
    }]
  });
  const status = reconcileProgram({ evidence_pack: pack });
  assert.equal(pack.claims.some((claim) => claim.text === "Meeting notes"), false);
  assert.equal(status.blockers.length, 0);
  assert.equal(status.confirmed_facts.length, 0);
  assert.equal(status.candidate_facts.length, 2);

  const reviewed = refineEvidencePack(pack, {
    updates: [{ matchText: "Launch approval is recorded.", set: { review_status: "confirmed" } }]
  });
  assert.equal(reconcileProgram({ evidence_pack: reviewed }).confirmed_facts.length, 1);
});

test("refinement recomputes conflicts, diagnostics, entities, and safe exports consistently", () => {
  const pack = createEvidencePack({
    now: NOW,
    sources: [
      { id: "a", captured_at: "2026-05-13T00:00:00Z", freshness: "fresh", content: "DEMO-1 starts 2026-05-20." },
      { id: "b", captured_at: "2026-05-13T00:00:00Z", freshness: "fresh", content: "DEMO-1 starts 2026-05-21." }
    ]
  });
  assert.equal(pack.conflicts.length, 1);

  const refined = refineEvidencePack(pack, {
    updates: [{ matchId: pack.claims[1].id, set: { text: "DEMO-1 starts 2026-05-20." } }]
  });
  assert.equal(refined.conflicts.length, 0);
  assert.equal(refined.diagnostics.summary.conflict_count, 0);
  assert.deepEqual(refined.entities.dates, ["2026-05-20"]);
  assert.match(refined.exports.repo_safe_summary, /Conflicts: 0/);
});

test("content hashes use collision-resistant SHA-256", () => {
  const makeHash = (content) => createEvidencePack({
    now: NOW,
    sources: [{ id: content, captured_at: "2026-05-13T00:00:00Z", freshness: "fresh", content }]
  }).sources[0].content_hash;
  assert.match(makeHash("Aa"), /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(makeHash("Aa"), makeHash("BB"));
});

test("CSV parsing preserves quoted commas and multiline fields as one record", () => {
  const pack = createEvidencePack({
    now: NOW,
    sources: [{
      id: "csv",
      type: "csv",
      captured_at: "2026-05-13T00:00:00Z",
      freshness: "fresh",
      content: 'item,notes\n"Launch, phase one","First line\nSecond line"'
    }]
  });
  assert.equal(pack.evidence_items.length, 1);
  assert.match(pack.evidence_items[0].text, /Launch, phase one/);
  assert.match(pack.evidence_items[0].text, /First line\nSecond line/);
  assert.equal(pack.evidence_items[0].source_ref.locator, "row:2");
});

test("local file adapter confines reads to baseDir, including relative escapes", () => {
  const root = mkdtempSync(join(tmpdir(), "capture-truth-"));
  const inside = join(root, "inside.txt");
  writeFileSync(inside, "inside", "utf8");
  try {
    const adapter = createLocalFileAdapter({ fs: { readFileSync, realpathSync: (value) => value }, baseDir: root });
    assert.equal(adapter.read({ path: "inside.txt" }).content, "inside");
    assert.throws(() => adapter.read({ path: "../outside.txt" }), /escapes baseDir/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("future adapter updates are unknown and invalid timeline dates fail validation", () => {
  const source = createJiraCompactAdapter({ now: NOW }).read({
    key: "DEMO-1",
    updated_at: "2026-05-15T00:00:00Z"
  });
  assert.equal(source.freshness, "unknown");

  const timeline = createTimeline({ items: [{ id: "x", label: "Bad date", date: "2026-02-30" }] });
  assert.equal(validateTimeline(timeline).gaps.some((gap) => gap.type === "invalid_date"), true);
});
