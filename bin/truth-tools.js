#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { isTextResult, runTruthTool } from "../src/truth-tools.js";

const [command, ...flags] = process.argv.slice(2);

try {
  if (!command || command === "help") {
    writeHelp();
  } else {
    const input = readInput(flags);
    const args = {
      ...input,
      format: getFlagValue(flags, "--format") ?? input.format,
      export_profile: getFlagValue(flags, "--export-profile") ?? input.export_profile,
      all: flags.includes("--all") || input.all
    };
    const result = runTruthTool(command, args);
    const jsonOut = flags.includes("--json-out") || (!isTextResult(command) && command !== "help");
    write(jsonOut ? JSON.stringify(result, null, 2) : String(result));
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
  write(`truth-tools commands:
  capture.create --json-out < intake.json
  capture.validate < evidence-pack.json
  capture.render --format markdown --export-profile repo-safe-summary < evidence-pack.json
  program.reconcile < evidence-pack.json
  timeline.create --json-out < timeline-input.json
  timeline.validate < timeline.json
  timeline.render --format markdown < timeline.json
  benchmark.fixture --json-out < benchmark-case.json
  doctor --all
`);
}
