import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createEvidencePack, validateEvidencePack } from "../src/evidence-pack.js";

test("golden mixed intake fixture creates a valid neutral evidence pack", () => {
  const input = JSON.parse(readFileSync("examples/mixed-intake.json", "utf8"));
  const pack = createEvidencePack(input);
  const validation = validateEvidencePack(pack);

  assert.equal(pack.sources.length, 3);
  assert.equal(pack.claims.length, 9);
  assert.equal(pack.conflicts.length, 0);
  assert.equal(validation.ok, true);
  assert.equal(pack.claims.some((claim) => claim.text.includes("launch gate remains manual")), true);
  assert.equal(pack.claims.some((claim) => claim.text.includes("API contract")), true);
  assert.equal(pack.claims.some((claim) => claim.text.includes("Confirm staging callback evidence")), true);
});
