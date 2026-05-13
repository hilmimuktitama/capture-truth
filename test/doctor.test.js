import test from "node:test";
import assert from "node:assert/strict";

import { runDoctor } from "../src/doctor.js";

test("doctor verifies install, schema, render, adapters, and MCP availability", () => {
  const result = runDoctor();

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((check) => check.name),
    ["install", "schema", "render", "adapters", "mcp"]
  );
  assert.equal(result.checks.every((check) => check.ok), true);
});
