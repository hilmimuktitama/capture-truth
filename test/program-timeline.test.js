import test from "node:test";
import assert from "node:assert/strict";

import { createEvidencePack, validateEvidencePack } from "../src/evidence-pack.js";
import { reconcileProgram } from "../src/program-status.js";
import { createTimeline, renderTimeline, validateTimeline } from "../src/timeline.js";

test("conflicts are first-class reconciliation objects with owner action", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "local-note",
        type: "text",
        captured_at: "2026-05-10T00:00:00Z",
        freshness: "stale",
        content: "DEMO-2944 is blocked by API owner gap."
      },
      {
        id: "jira",
        type: "text",
        adapter: "jira",
        key: "DEMO-2944",
        captured_at: "2026-05-14T00:00:00Z",
        freshness: "fresh",
        content: "DEMO-2944 is not blocked by API owner gap."
      }
    ]
  });
  const validation = validateEvidencePack(pack);

  assert.equal(validation.conflicts.length, 1);
  assert.deepEqual(Object.keys(validation.conflicts[0]).sort(), [
    "claim",
    "conflict_type",
    "recommended_owner_action",
    "source_a",
    "source_b"
  ]);
  assert.equal(validation.conflicts[0].conflict_type, "claim_disagreement");
  assert.equal(validation.conflicts[0].source_a.system, "local-note");
  assert.equal(validation.conflicts[0].source_b.system, "jira");
  assert.match(validation.conflicts[0].recommended_owner_action, /owner/i);
});

test("program reconcile returns the standard program-status schema", () => {
  const pack = createEvidencePack({
    sources: [
      {
        id: "bifrost-jira",
        type: "text",
        adapter: "jira",
        key: "DOCS-7550",
        captured_at: "2026-05-14T00:00:00Z",
        freshness: "fresh",
        content: "DOCS-7550 remains open and blocked by readiness sign-off."
      },
      {
        id: "readiness-doc",
        type: "text",
        adapter: "confluence",
        captured_at: "2026-05-13T00:00:00Z",
        freshness: "captured",
        content: "Confluence readiness says Example is ready."
      }
    ]
  });

  const status = reconcileProgram({ evidence_pack: pack });

  assert.equal(status.kind, "program_status");
  assert.deepEqual(Object.keys(status).sort(), [
    "assumptions",
    "blockers",
    "candidate_facts",
    "confirmed_facts",
    "conflicts",
    "kind",
    "recommended_write_back",
    "risks",
    "unknowns",
    "version"
  ]);
  assert.equal(status.blockers.length, 1);
  assert.equal(status.confirmed_facts.length, 0);
  assert.equal(status.candidate_facts.length, 1);
  assert.equal(status.recommended_write_back.repo.length > 0, true);
  assert.equal(status.recommended_write_back.local_only.length > 0, true);
});

test("timeline preserves TBC, exact, and conflicting date status explicitly", () => {
  const timeline = createTimeline({
    items: [
      {
        id: "phase-1",
        label: "Real client phase 1",
        date: "2026-05-27",
        blocks_next_milestone: true
      },
      {
        id: "phase-2",
        label: "Phase 2 rollout",
        date_status: "tbc",
        blocks_next_milestone: "unknown"
      },
      {
        id: "example-rollout-start",
        label: "Real client start",
        date: "2026-05-27",
        alternate_dates: ["2026-06-02"]
      }
    ]
  });

  const validation = validateTimeline(timeline);
  const markdown = renderTimeline(timeline);

  assert.equal(validation.ok, true);
  assert.equal(timeline.items[0].date_status, "exact");
  assert.equal(timeline.items[1].date_status, "tbc");
  assert.equal(timeline.items[1].blocks_next_milestone, "unknown");
  assert.equal(timeline.items[2].date_status, "conflicting");
  assert.match(markdown, /Phase 2 rollout.*TBC/i);
  assert.match(markdown, /Real client start.*conflicting/i);
});
