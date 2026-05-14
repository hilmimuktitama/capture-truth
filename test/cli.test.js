import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("CLI creates evidence packs from stdin JSON", () => {
  const result = spawnSync(
    process.execPath,
    ["bin/capture-truth.js", "create", "--json-out"],
    {
      cwd: process.cwd(),
      input: JSON.stringify({
        sources: [
          {
            id: "stdin",
            type: "text",
            captured_at: "2026-05-12T14:00:00Z",
            freshness: "fresh",
            content: "Owner PM captured the launch note by 2026-05-14."
          }
        ]
      }),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.kind, "evidence_pack");
  assert.equal(parsed.claims.length, 1);
});

test("CLI renders repo-safe evidence summaries", () => {
  const result = spawnSync(
    process.execPath,
    ["bin/capture-truth.js", "render", "--format", "markdown", "--export-profile", "repo-safe-summary"],
    {
      cwd: process.cwd(),
      input: JSON.stringify({
        evidence_pack: {
          kind: "evidence_pack",
          sources: [
            {
              id: "raw",
              type: "text",
              captured_at: "2026-05-12T14:00:00Z",
              freshness: "fresh",
              content: "Fixture credential api_key=REDACTED_EXAMPLE should not render."
            }
          ],
          claims: [
            {
              id: "claim-1",
              text: "Repo-safe render should keep summary metadata.",
              source_refs: [{ source_id: "raw", locator: "line:1" }]
            }
          ],
          gaps: [],
          conflicts: [],
          assumptions: []
        }
      }),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Export profile: repo-safe-summary/);
  assert.doesNotMatch(result.stdout, /abc123/);
  assert.doesNotMatch(result.stdout, /should not render/);
});

test("CLI doctor smoke-tests capture-truth readiness", () => {
  const result = spawnSync(process.execPath, ["bin/capture-truth.js", "doctor"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok - install:/);
  assert.match(result.stdout, /ok - schema:/);
  assert.match(result.stdout, /ok - render:/);
  assert.match(result.stdout, /ok - adapters:/);
  assert.match(result.stdout, /ok - mcp:/);
});

test("CLI benchmark emits deterministic fixture JSON", () => {
  const result = spawnSync(process.execPath, ["bin/capture-truth.js", "benchmark", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "capture-truth-benchmark-fixture");
  assert.equal(parsed.evidence_pack.conflicts.length, 2);
  assert.equal(parsed.validation.gaps.some((gap) => gap.type === "stale_source"), true);
  assert.doesNotMatch(parsed.repo_safe_summary, /secret=abc123/);
});
