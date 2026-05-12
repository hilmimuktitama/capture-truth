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
