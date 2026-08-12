import test from "node:test";
import assert from "node:assert/strict";
import { runDoctor } from "../src/doctor.js";
test("doctor reports installed 0.4.1 capture surfaces", async () => { const result = await runDoctor(); assert.equal(result.ok, true); assert.equal(result.checks.find((c) => c.name === "install").message.includes("v0.4.1"), true); });
