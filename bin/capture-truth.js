#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { renderBenchmarkFixture, runBenchmarkFixture } from "../src/benchmark.js";
import {
  createEvidencePack,
  refineEvidencePack,
  renderEvidencePack,
  validateEvidencePack
} from "../src/evidence-pack.js";
import { runDoctor } from "../src/doctor.js";

const [command, ...flags] = process.argv.slice(2);

try {
  let result;

  switch (command) {
    case "doctor": {
      const result = runDoctor();
      for (const check of result.checks) {
        write(`${check.ok ? "ok" : "fail"} - ${check.name}: ${check.message}`);
      }
      if (!result.ok) {
        process.exitCode = 1;
      }
      break;
    }
    case "benchmark": {
      const result = runBenchmarkFixture();
      write(flags.includes("--json") ? JSON.stringify(result, null, 2) : renderBenchmarkFixture(result));
      break;
    }
    case "create": {
      const input = readInput(flags);
      const jsonOut = flags.includes("--json-out");
      result = createEvidencePack(input);
      write(jsonOut ? JSON.stringify(result, null, 2) : renderEvidencePack(result));
      break;
    }
    case "validate": {
      const input = readInput(flags);
      result = validateEvidencePack(input.evidence_pack ?? input);
      write(JSON.stringify(result, null, 2));
      break;
    }
    case "render": {
      const input = readInput(flags);
      write(
        renderEvidencePack(input.evidence_pack ?? input, {
          format: getFlagValue(flags, "--format") ?? "markdown",
          export_profile: getFlagValue(flags, "--export-profile") ?? undefined
        })
      );
      break;
    }
    case "refine": {
      const input = readInput(flags);
      const jsonOut = flags.includes("--json-out");
      result = refineEvidencePack(input.evidence_pack, { updates: input.updates });
      write(jsonOut ? JSON.stringify(result, null, 2) : renderEvidencePack(result));
      break;
    }
    case "help":
    case undefined:
      writeHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function readInput(flags) {
  const file = getFlagValue(flags, "--input");
  const text = file ? readFileSync(file, "utf8") : readStdin();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function getFlagValue(flags, flagName) {
  const index = flags.indexOf(flagName);
  if (index === -1) {
    return null;
  }
  return flags[index + 1] ?? null;
}

function write(text) {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function writeHelp() {
  write(`capture-truth commands:
  doctor
  benchmark --json
  create --json-out < input.json
  validate < evidence-pack.json
  render --format markdown < evidence-pack.json
  render --format markdown --export-profile repo-safe-summary < evidence-pack.json
  refine --json-out < refine-input.json
`);
}
