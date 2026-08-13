import { readFileSync } from "node:fs";
import { createEvidencePack, buildProfileExport } from "../src/capture.js";
import { CONTRACT_VERSION, validateEvidencePack } from "../src/contracts.js";

const data = JSON.parse(readFileSync(new URL("../evaluation/cases.json", import.meta.url), "utf8"));
const clock = () => new Date("2026-07-19T00:00:00Z");
let passed = 0;
let seeded = 0;
let defects = 0;
const cleanFalsePositives = [];

if (data.schema_version !== CONTRACT_VERSION) {
  process.stderr.write(`Evaluation schema version ${data.schema_version} does not match contract ${CONTRACT_VERSION}.\n`);
  process.exitCode = 1;
}

function exportFor(entry, pack) {
  return entry.id === "raw-local-inclusion"
    ? buildProfileExport(pack, "raw-local-only", { portable: false })
    : buildProfileExport(pack, entry.id === "secret-redaction" ? "internal-evidence-pack" : "repo-safe-summary");
}

function run(entry) {
  const pack = createEvidencePack({ sources: entry.sources, now: clock });
  const errors = [];
  const expected = entry.expect ?? {};
  let output;
  let rejection;

  try {
    output = exportFor(entry, pack);
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }

  const packTypes = pack.diagnostics.map((diagnostic) => diagnostic.type);
  const types = [...pack.diagnostics, ...(output?.diagnostics ?? [])].map((diagnostic) => diagnostic.type);
  for (const type of expected.diagnostics ?? []) {
    seeded += 1;
    if (!types.includes(type)) {
      defects += 1;
      errors.push(`missing diagnostic ${type}`);
    }
  }

  if (expected.export_rejection !== undefined) {
    const expectedRejection = expected.export_rejection;
    if (!rejection) errors.push("expected export rejection");
    else if (expectedRejection !== true && !rejection.includes(expectedRejection)) errors.push(`unexpected export rejection: ${rejection}`);
  } else if (rejection) {
    errors.push(`unexpected export rejection: ${rejection}`);
  }

  if (entry.id === "clean" && packTypes.length) cleanFalsePositives.push(entry.id);
  if (expected.suggested_kind && !pack.candidate_claims.some((claim) => claim.suggested_kind === expected.suggested_kind && claim.review_status === expected.review_status)) errors.push("candidate suggestion mismatch");
  if (output && expected.portable_excludes && JSON.stringify(output).includes(expected.portable_excludes)) errors.push("portable raw leak");
  if (output && expected.raw_local_includes && !JSON.stringify(output).includes(expected.raw_local_includes)) errors.push("local raw missing");
  if (expected.secret_values) {
    for (const profile of ["repo-safe-summary", "internal-evidence-pack"]) {
      let secretOutput;
      try {
        secretOutput = buildProfileExport(pack, profile);
      } catch (error) {
        errors.push(`unexpected export rejection for ${profile}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const text = JSON.stringify(secretOutput);
      for (const secret of expected.secret_values) if (text.includes(secret)) errors.push(`portable secret leak: ${secret}`);
    }
  }
  if (expected.schema_valid && validateEvidencePack(pack).length) errors.push("pack schema invalid");

  const repeatPack = createEvidencePack({ sources: entry.sources, now: clock });
  if (JSON.stringify(repeatPack) !== JSON.stringify(pack)) errors.push("non-repeatable output");
  let repeatRejection;
  try {
    exportFor(entry, repeatPack);
  } catch (error) {
    repeatRejection = error instanceof Error ? error.message : String(error);
  }
  if (repeatRejection !== rejection) errors.push("non-repeatable export result");
  if (!rejection && JSON.stringify(exportFor(entry, repeatPack)) !== JSON.stringify(output)) errors.push("non-repeatable export output");
  return errors;
}

for (const entry of data.cases) { const errors = run(entry); if (!errors.length) passed += 1; process.stdout.write(`${errors.length ? "FAIL" : "ok"} - ${entry.id}${errors.length ? `: ${errors.join("; ")}` : ""}\n`); }
const recall = seeded ? (seeded - defects) / seeded : 1; process.stdout.write(`Synthetic contract evaluation: ${passed}/${data.cases.length} cases passed.\nCase count: ${data.cases.length}; seeded-defect recall: ${recall.toFixed(2)} (${seeded - defects}/${seeded}); clean false positives: ${cleanFalsePositives.length}; repeatability: fixed-clock repeated output comparison.\nLimitations: synthetic cases do not prove source correctness or confidentiality guarantees.\n`); process.exitCode = passed === data.cases.length ? 0 : 1;
