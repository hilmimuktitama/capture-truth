import test from "node:test";
import assert from "node:assert/strict";
import { normalizeJiraIssue, normalizeConfluencePage } from "../src/adapters.js";

test("already-fetched Jira and Confluence normalizers do not fetch or include bodies", () => {
  const jira = normalizeJiraIssue({ key: "OPS-1", summary: "Rollout", status: "Blocked", updated_at: "2026-07-19T00:00:00Z" }, { now: () => new Date("2026-07-20T00:00:00Z") });
  const page = normalizeConfluencePage({ id: "page-1", title: "Runbook", version: { number: 2, when: "2026-07-19T00:00:00Z" } }, { now: () => new Date("2026-07-20T00:00:00Z") });
  assert.equal(jira.metadata.raw_body_included, false); assert.equal(page.metadata.raw_body_included, false);
  assert.equal(Object.hasOwn(jira, "content"), false); assert.equal(Object.hasOwn(page, "body"), false);
});
