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
  assert.equal(validation.conflicts[0].claim, "Launch payment QA blocker");
  assert.equal(validation.conflicts[0].source_a.system, "jira-1");
  assert.equal(validation.conflicts[0].source_b.system, "jira-1");
  assert.equal(validation.conflicts[0].conflict_type, "claim_disagreement");
  assert.match(validation.conflicts[0].recommended_owner_action, /reconcile/i);
});

test("detects same-ticket date conflicts as first-class reconciliation work", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "local-note",
        type: "text",
        captured_at: "2026-05-14T00:00:00Z",
        freshness: "stale",
        content: "DEMO-2944 example-rollout start date is 2026-05-27."
      },
      {
        id: "jira",
        type: "text",
        captured_at: "2026-05-14T01:00:00Z",
        freshness: "fresh",
        content: "DEMO-2944 example-rollout start date is 2026-06-02."
      }
    ]
  });

  assert.equal(pack.conflicts.length, 1);
  assert.deepEqual(pack.conflicts[0], {
    claim: "DEMO-2944 date",
    source_a: {
      system: "local-note",
      value: "2026-05-27",
      captured_at: "2026-05-14T00:00:00Z",
      freshness: "stale"
    },
    source_b: {
      system: "jira",
      value: "2026-06-02",
      captured_at: "2026-05-14T01:00:00Z",
      freshness: "fresh"
    },
    conflict_type: "date_mismatch",
    recommended_owner_action:
      "Assign an owner to reconcile the source disagreement and update the system of record."
  });
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

test("renders repo-safe summaries without raw source bodies or sensitive values", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "jira-raw",
        type: "text",
        captured_at: "2026-05-12T14:00:00Z",
        freshness: "fresh",
        content: "Fixture credential api_key=REDACTED_EXAMPLE. Raw launch detail must stay local."
      }
    ]
  });

  const markdown = renderEvidencePack(pack, {
    format: "markdown",
    export_profile: "repo-safe-summary"
  });

  assert.match(markdown, /# Evidence Pack/);
  assert.match(markdown, /Export profile: repo-safe-summary/);
  assert.match(markdown, /Redaction warnings/);
  assert.doesNotMatch(markdown, /abc123/);
  assert.doesNotMatch(markdown, /Raw launch detail must stay local/);
});

test("renders repo-safe conflict details while redacting sensitive conflict values", () => {
  const pack = {
    kind: "evidence_pack",
    sources: [],
    claims: [],
    gaps: [],
    conflicts: [
      {
        claim: "API token mismatch",
        source_a: {
          system: "local-note",
          value: "api_key=REDACTED_EXAMPLE",
          captured_at: "2026-05-01T00:00:00Z",
          freshness: "stale"
        },
        source_b: {
          system: "jira-DEMO-2944",
          value: "2026-06-02",
          captured_at: "2026-05-14T00:00:00.000Z",
          freshness: "fresh"
        },
        conflict_type: "claim_disagreement",
        recommended_owner_action: "Assign an owner to reconcile the source disagreement."
      }
    ],
    assumptions: []
  };

  const markdown = renderEvidencePack(pack, {
    format: "markdown",
    export_profile: "repo-safe-summary"
  });

  assert.match(markdown, /claim_disagreement: API token mismatch/);
  assert.match(markdown, /local-note: \[redacted\], captured: 2026-05-01T00:00:00Z, freshness: stale/);
  assert.match(markdown, /jira-DEMO-2944: 2026-06-02, captured: 2026-05-14T00:00:00.000Z, freshness: fresh/);
  assert.match(markdown, /Action: Assign an owner to reconcile the source disagreement\./);
  assert.doesNotMatch(markdown, /api_key=REDACTED_EXAMPLE/);
});

test("renders internal evidence packs with raw content redacted", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "confluence",
        type: "text",
        captured_at: "2026-05-12T14:00:00Z",
        freshness: "fresh",
        content: "Private readiness note."
      }
    ]
  });

  const json = renderEvidencePack(pack, {
    format: "json",
    export_profile: "internal-evidence-pack"
  });
  const parsed = JSON.parse(json);

  assert.equal(parsed.sources[0].content_redacted, true);
  assert.equal(parsed.sources[0].content, undefined);
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
