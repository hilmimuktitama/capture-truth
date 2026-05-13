import test from "node:test";
import assert from "node:assert/strict";

import {
  createConfluenceCompactAdapter,
  createFixtureAdapter,
  createJiraCompactAdapter
} from "../src/adapters.js";
import { createEvidencePack } from "../src/evidence-pack.js";

test("fixture adapter returns read-only source-shaped records", () => {
  const adapter = createFixtureAdapter({
    fixtures: {
      note: {
        type: "text",
        freshness: "fixture",
        content: "Owner TPM captured fixture evidence by 2026-05-13."
      }
    }
  });

  const source = adapter.read({ key: "note", captured_at: "2026-05-12T14:00:00Z" });
  const pack = createEvidencePack({ sources: [source] });

  assert.equal(adapter.metadata.read_only, true);
  assert.deepEqual(adapter.capabilities, ["read"]);
  assert.equal(pack.sources[0].adapter, "fixture");
  assert.equal(pack.claims.length, 1);
});

test("jira compact adapter stamps freshness and avoids raw descriptions", () => {
  const adapter = createJiraCompactAdapter({
    now: () => new Date("2026-05-14T00:00:00Z"),
    freshWithinDays: 3
  });

  const source = adapter.read({
    key: "TF-2944",
    summary: "Real-client rollout",
    status: "In Progress",
    assignee: "Platform",
    updated_at: "2026-05-13T12:00:00Z",
    url: "https://example.atlassian.net/browse/TF-2944",
    description: "Raw customer details must not enter compact intake."
  });

  assert.equal(adapter.metadata.read_only, true);
  assert.equal(source.id, "jira-TF-2944");
  assert.equal(source.adapter, "jira_compact");
  assert.equal(source.key, "TF-2944");
  assert.equal(source.freshness, "fresh");
  assert.equal(source.captured_at, "2026-05-14T00:00:00.000Z");
  assert.match(source.content, /TF-2944/);
  assert.match(source.content, /status: In Progress/);
  assert.doesNotMatch(source.content, /Raw customer details/);
});

test("confluence compact adapter marks stale pages with update metadata", () => {
  const adapter = createConfluenceCompactAdapter({
    now: () => new Date("2026-05-14T00:00:00Z"),
    freshWithinDays: 7
  });

  const source = adapter.read({
    id: "BIF-7550-readiness",
    title: "Bifrost readiness",
    space: "TPM",
    status: "current",
    version: 8,
    updated_at: "2026-04-20T00:00:00Z",
    url: "https://example.atlassian.net/wiki/spaces/TPM/pages/1",
    body: "Raw page body must stay out of compact intake."
  });

  assert.equal(source.id, "confluence-BIF-7550-readiness");
  assert.equal(source.adapter, "confluence_compact");
  assert.equal(source.freshness, "stale");
  assert.equal(source.metadata.updated_at, "2026-04-20T00:00:00Z");
  assert.match(source.content, /title: Bifrost readiness/);
  assert.match(source.content, /version: 8/);
  assert.doesNotMatch(source.content, /Raw page body/);
});
