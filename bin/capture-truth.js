#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createEvidencePack, buildCaptureOutput, buildProfileExport, reviewCandidateClaim, assertOutputMode, PACKAGE_VERSION, RAW_LOCAL_ONLY_PROFILE } from "../src/capture.js";
import { runDoctor } from "../src/doctor.js";

class UsageError extends Error {}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "doctor") { const result = await runDoctor(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) process.exitCode = 1; }
  else if (command === "capture") await capture(args);
  else if (command === "export") await exportPack(args);
  else if (command === "candidate-review") await candidateReview(args);
  else if (!command || ["--help", "-h", "help"].includes(command)) help();
  else throw new UsageError(`Unknown command: ${command}`);
} catch (error) { process.stderr.write(`${error.message ?? error}\n`); process.exitCode = 1; }

async function capture(args) {
  let sourceFile; let profile; let outputMode = "pack"; let out;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--source") sourceFile = required(args, ++i, "--source");
    else if (args[i] === "--profile") profile = required(args, ++i, "--profile");
    else if (args[i] === "--output-mode") outputMode = required(args, ++i, "--output-mode");
    else if (args[i] === "--out") out = required(args, ++i, "--out");
    else if (args[i].startsWith("-")) throw new UsageError(`Unsupported flag: ${args[i]}`);
    else throw new UsageError(`Unsupported argument: ${args[i]}`);
  }
  if (!sourceFile) throw new UsageError("capture requires --source <file>.");
  assertOutputMode(outputMode);
  if (outputMode === "pack" && profile !== undefined) throw new UsageError("--profile is only valid when --output-mode is export or both.");
  if (outputMode !== "pack" && profile === undefined) throw new UsageError("--profile is required when an export is requested.");
  const input = JSON.parse(readFileSync(sourceFile, "utf8"));
  const pack = createEvidencePack({ sources: Array.isArray(input) ? input : input.sources ?? [input], now: () => new Date() });
  const output = buildCliOutput(pack, { outputMode, profile });
  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (out) writeFileSync(out, text); else process.stdout.write(text);
}
async function exportPack(args) {
  let packFile; let profile; let outputMode = "export"; let out;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--pack") packFile = required(args, ++i, "--pack");
    else if (args[i] === "--profile") profile = required(args, ++i, "--profile");
    else if (args[i] === "--output-mode") outputMode = required(args, ++i, "--output-mode");
    else if (args[i] === "--out") out = required(args, ++i, "--out");
    else throw new UsageError(`Unsupported argument: ${args[i]}`);
  }
  if (!packFile) throw new UsageError("export requires --pack <file>.");
  if (profile === undefined) throw new UsageError("export requires --profile <profile>.");
  assertOutputMode(outputMode);
  if (outputMode === "pack") throw new UsageError("export --output-mode must be export or both.");
  const parsed = JSON.parse(readFileSync(packFile, "utf8"));
  const pack = parsed.pack ?? parsed;
  const output = buildCliOutput(pack, { outputMode, profile });
  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (out) writeFileSync(out, text); else process.stdout.write(text);
}
async function candidateReview(args) {
  let packFile; let candidateId; let decision; let reviewedBy; let reviewedAt; let profile; let outputMode; let out;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--pack") packFile = required(args, ++i, "--pack");
    else if (args[i] === "--candidate-id") candidateId = required(args, ++i, "--candidate-id");
    else if (args[i] === "--decision") decision = required(args, ++i, "--decision");
    else if (args[i] === "--reviewed-by") reviewedBy = required(args, ++i, "--reviewed-by");
    else if (args[i] === "--reviewed-at") reviewedAt = required(args, ++i, "--reviewed-at");
    else if (args[i] === "--profile") profile = required(args, ++i, "--profile");
    else if (args[i] === "--output-mode") outputMode = required(args, ++i, "--output-mode");
    else if (args[i] === "--out") out = required(args, ++i, "--out");
    else throw new UsageError(`Unsupported argument: ${args[i]}`);
  }
  if (!packFile) throw new UsageError("candidate-review requires --pack <file>.");
  if (outputMode !== undefined) assertOutputMode(outputMode);
  if (outputMode === "pack" && profile !== undefined) throw new UsageError("--profile is only valid when --output-mode is export or both.");
  const parsed = JSON.parse(readFileSync(packFile, "utf8"));
  const reviewed = reviewCandidateClaim(parsed.pack ?? parsed, { candidateId, decision, reviewedBy, reviewedAt });
  if (outputMode === undefined) {
    outputMode = "export";
    profile ??= "portable-summary";
  } else if (outputMode !== "pack" && profile === undefined) {
    throw new UsageError("--profile is required when an export is requested.");
  }
  const output = outputMode === "pack"
    ? reviewed
    : outputMode === "both"
      ? { reviewed_pack: reviewed, export: buildLocalExport(reviewed, profile) }
      : buildLocalExport(reviewed, profile);
  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (out) writeFileSync(out, text); else process.stdout.write(text);
}
function buildCliOutput(pack, { outputMode, profile }) {
  if (profile !== RAW_LOCAL_ONLY_PROFILE) return buildCaptureOutput(pack, { outputMode, profile });
  const exported = buildLocalExport(pack, profile);
  return outputMode === "both" ? { pack, export: exported } : exported;
}
function buildLocalExport(pack, profile) { return buildProfileExport(pack, profile, { portable: false }); }
function required(args, i, flag) { if (!args[i] || args[i].startsWith("-")) throw new UsageError(`${flag} requires a value.`); return args[i]; }
function help() { process.stdout.write(`capture-truth ${PACKAGE_VERSION} — provenance-preserving evidence capture\n\nUsage:\n  capture-truth capture --source <file> [--output-mode <pack|export|both>] [--profile <profile>] [--out <file>]\n  capture-truth export --pack <file> --profile <profile> [--out <file>]\n  capture-truth candidate-review --pack <file> --candidate-id <id> --decision <approve-portable|reject> --reviewed-by <name> --reviewed-at <RFC3339> [--output-mode <pack|export|both>] [--profile <profile>] [--out <file>]\n  capture-truth doctor\n  capture-truth --help\n\nOutput modes: capture defaults to pack and requires --profile for export or both. export requires --profile. candidate-review defaults to the historical portable-summary export; explicit export or both requires --profile. Use --output-mode pack for sequential reviewed-pack flows.\nProfiles: portable-summary, internal-evidence-pack, repo-safe-summary, raw-local-only. Raw-local-only is local-only.\nInput is already-exported JSON; no source fetching is performed.\n`); }
