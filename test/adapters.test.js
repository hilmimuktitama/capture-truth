import test from "node:test";
import assert from "node:assert/strict";

import { createFixtureAdapter } from "../src/adapters.js";
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
