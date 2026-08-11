#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createEvidencePack, buildProfileExport, PACKAGE_VERSION } from "../src/capture.js";
import { runDoctor } from "../src/doctor.js";

class UsageError extends Error {}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "doctor") { const result = await runDoctor(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) process.exitCode = 1; }
  else if (command === "capture") await capture(args);
  else if (!command || ["--help", "-h", "help"].includes(command)) help();
  else throw new UsageError(`Unknown command: ${command}`);
} catch (error) { process.stderr.write(`${error.message ?? error}\n`); process.exitCode = 1; }

async function capture(args) {
  let sourceFile; let profile = "repo-safe-summary"; let out;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--source") sourceFile = required(args, ++i, "--source");
    else if (args[i] === "--profile") profile = required(args, ++i, "--profile");
    else if (args[i] === "--out") out = required(args, ++i, "--out");
    else if (args[i].startsWith("-")) throw new UsageError(`Unsupported flag: ${args[i]}`);
    else throw new UsageError(`Unsupported argument: ${args[i]}`);
  }
  if (!sourceFile) throw new UsageError("capture requires --source <file>.");
  const input = JSON.parse(readFileSync(sourceFile, "utf8"));
  const pack = createEvidencePack({ sources: Array.isArray(input) ? input : input.sources ?? [input], now: () => new Date() });
  const output = buildProfileExport(pack, profile);
  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (out) writeFileSync(out, text); else process.stdout.write(text);
}
function required(args, i, flag) { if (!args[i] || args[i].startsWith("-")) throw new UsageError(`${flag} requires a value.`); return args[i]; }
function help() { process.stdout.write(`capture-truth ${PACKAGE_VERSION} — provenance-preserving evidence capture\n\nUsage:\n  capture-truth capture --source <file> [--profile <repo-safe-summary|internal-evidence-pack|raw-local-only>] [--out <file>]\n  capture-truth doctor\n  capture-truth --help\n\nInput is already-exported JSON; no source fetching is performed.\n`); }
