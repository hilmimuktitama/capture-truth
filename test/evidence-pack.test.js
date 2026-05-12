import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvidencePack,
  refineEvidencePack,
  renderEvidencePack,
  validateEvidencePack
} from "../src/evidence-pack.js";

test("creates an evidence pack from text and preserves source refs", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "status-note",
        type: "text",
        path: "notes/status.txt",
        captured_at: "2026-05-12T14:00:00Z",
        freshness: "fresh",
        content:
          "API contract is blocked by missing owner by 2026-05-20.\nCheckout QA owner QA due 2026-05-22."
      }
    ]
  });

  assert.equal(pack.kind, "evidence_pack");
  assert.equal(pack.sources.length, 1);
  assert.equal(pack.sources[0].id, "status-note");
  assert.equal(pack.sources[0].path, "notes/status.txt");
  assert.equal(pack.claims.length, 2);
  assert.deepEqual(pack.claims[0].source_refs, [
    { source_id: "status-note", locator: "line:1" }
  ]);
  assert.equal(pack.entities.dates.includes("2026-05-20"), true);
  assert.equal(pack.assumptions.includes("No status, risk, timeline, or truth judgment was inferred."), true);
});

test("extracts claims from markdown, csv, and json sources", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "md",
        type: "markdown",
        captured_at: "2026-05-12T14:00:00Z",
        freshness: "fresh",
        content: "# Update\n\n- Decision: launch gate stays manual. Owner PM due 2026-05-18."
      },
      {
        id: "csv",
        type: "csv",
        captured_at: "2026-05-12T14:01:00Z",
        freshness: "fresh",
        content: "item,owner,due\nMigration fallback,Platform,2026-05-21"
      },
      {
        id: "json",
        type: "json",
        captured_at: "2026-05-12T14:02:00Z",
        freshness: "fresh",
        content: [{ action: "Confirm staging sign-off", owner: "QA", due: "2026-05-19" }]
      }
    ]
  });

  assert.equal(pack.claims.length, 3);
  assert.equal(pack.claims.some((claim) => claim.text.includes("launch gate")), true);
  assert.equal(pack.claims.some((claim) => claim.text.includes("Migration fallback")), true);
  assert.equal(pack.claims.some((claim) => claim.text.includes("Confirm staging sign-off")), true);
});

test("validates missing metadata, duplicate sources, stale freshness, and unresolved conflicts", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "jira-1",
        type: "text",
        captured_at: "2026-04-01T00:00:00Z",
        freshness: "stale",
        content: "Launch is blocked by payment QA."
      },
      {
        id: "jira-1",
        type: "text",
        content: "Launch is not blocked by payment QA."
      }
    ]
  });

  const validation = validateEvidencePack(pack);

  assert.equal(validation.ok, false);
  assert.equal(validation.gaps.some((gap) => gap.type === "duplicate_source_id"), true);
  assert.equal(validation.gaps.some((gap) => gap.type === "missing_captured_at"), true);
  assert.equal(validation.gaps.some((gap) => gap.type === "missing_freshness"), true);
  assert.equal(validation.gaps.some((gap) => gap.type === "stale_source"), true);
  assert.equal(validation.conflicts.length, 1);
});

test("renders evidence packs as markdown and json", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "source",
        type: "text",
        captured_at: "2026-05-12T14:00:00Z",
        freshness: "fresh",
        content: "Owner PM will confirm launch decision by 2026-05-20."
      }
    ]
  });

  const markdown = renderEvidencePack(pack, { format: "markdown" });
  const json = renderEvidencePack(pack, { format: "json" });

  assert.match(markdown, /# Evidence Pack/);
  assert.match(markdown, /## Sources/);
  assert.match(markdown, /Owner PM will confirm launch decision/);
  assert.deepEqual(JSON.parse(json).kind, "evidence_pack");
});

test("refines packs without dropping existing source refs", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "source",
        type: "text",
        captured_at: "2026-05-12T14:00:00Z",
        freshness: "fresh",
        content: "Owner PM will confirm launch decision by 2026-05-20."
      }
    ]
  });

  const refined = refineEvidencePack(pack, {
    updates: [
      {
        matchId: pack.claims[0].id,
        set: { classification: "decision", reviewer_note: "Reviewed by TPM" }
      }
    ]
  });

  assert.equal(refined.claims[0].classification, "decision");
  assert.equal(refined.claims[0].reviewer_note, "Reviewed by TPM");
  assert.deepEqual(refined.claims[0].source_refs, pack.claims[0].source_refs);
  assert.equal(refined.assumptions.includes("Refinement preserved source_refs unless explicitly replaced."), true);
});
