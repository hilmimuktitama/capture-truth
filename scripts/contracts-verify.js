import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONTRACT_VERSION, SOURCE_SCHEMA, SOURCE_REF_SCHEMA, CANDIDATE_CLAIM_SCHEMA, SOURCE_REQUIRED, SOURCE_REF_REQUIRED, CANDIDATE_CLAIM_REQUIRED, SOURCE_PROPERTY_TYPES, SOURCE_REF_PROPERTY_TYPES, CANDIDATE_CLAIM_PROPERTY_TYPES, validateEvidencePack, validateSourceRecord, validateSourceRef, validateCandidateClaim } from "../src/contracts.js";
import { createEvidencePack } from "../src/capture.js";
const root = resolve(new URL("..", import.meta.url).pathname);
let failed = false;
for (const [name, schema, required, types, validator, fixture] of [["source.schema.json", SOURCE_SCHEMA, SOURCE_REQUIRED, SOURCE_PROPERTY_TYPES, validateSourceRecord, { id: "parity", type: "record", observed_at: "2026-07-19T00:00:00Z" }], ["source-ref.schema.json", SOURCE_REF_SCHEMA, SOURCE_REF_REQUIRED, SOURCE_REF_PROPERTY_TYPES, validateSourceRef, { source_id: "parity", locator: "fixture" }], ["candidate-claim.schema.json", CANDIDATE_CLAIM_SCHEMA, CANDIDATE_CLAIM_REQUIRED, CANDIDATE_CLAIM_PROPERTY_TYPES, validateCandidateClaim, { id: "parity", text: "status: Ready", classification_method: "keyword", review_status: "unreviewed", source_refs: [{ source_id: "s", locator: "fixture" }], derivation_version: CONTRACT_VERSION, source_material: "structured_fields" }]]) {
  try { JSON.parse(readFileSync(join(root, "schemas", name), "utf8")); process.stdout.write(`ok - ${name} parses\n`); } catch (e) { failed = true; process.stdout.write(`FAIL - ${name}: ${e.message}\n`); }
  for (const key of required) if (!schema.required?.includes(key)) { failed = true; process.stdout.write(`FAIL - ${name}: required key ${key} missing from schema\n`); }
  for (const [key, type] of Object.entries(types)) if (JSON.stringify(schemaType(schema.properties?.[key])) !== JSON.stringify(type)) { failed = true; process.stdout.write(`FAIL - ${name}: property type drift for ${key}\n`); }
  if (validator(fixture).length) { failed = true; process.stdout.write(`FAIL - ${name}: runtime fixture rejected\n`); } else process.stdout.write(`ok - ${name} runtime fixture\n`);
}
const pack = createEvidencePack({ now: () => new Date("2026-07-19T00:00:00Z"), sources: [{ id: "verify", locator: "fixture", fields: { status: "Ready" } }] });
if (pack.schema_version !== CONTRACT_VERSION || validateEvidencePack(pack).length) { failed = true; process.stdout.write("FAIL - runtime evidence pack contract\n"); } else process.stdout.write("ok - runtime evidence pack contract\n");
const configured = process.env.TRUTH_TOOLS_SCHEMA_DIR;
const sibling = configured ?? join(root, "..", "truth-tools", "packages", "contracts", "schemas");
if (configured && !existsSync(sibling)) { failed = true; process.stdout.write(`FAIL - explicit TRUTH_TOOLS_SCHEMA_DIR missing: ${sibling}\n`); }
else if (existsSync(sibling)) for (const name of ["source.schema.json", "source-ref.schema.json", "candidate-claim.schema.json"]) { const candidate = join(sibling, name); if (!existsSync(candidate)) { failed = true; process.stdout.write(`FAIL - Truth Tools schema ${name} missing\n`); continue; } const same = readFileSync(join(root, "schemas", name), "utf8") === readFileSync(candidate, "utf8"); if (!same) failed = true; process.stdout.write(`${same ? "ok" : "FAIL"} - Truth Tools schema ${name} ${same ? "matches" : "differs"}\n`); }
else process.stdout.write("skipped - sibling Truth Tools schema copy absent\n");
process.exitCode = failed ? 1 : 0;

function schemaType(property) {
  if (property?.type !== undefined) return property.type;
  if (property?.$ref?.endsWith("metadata_object")) return "object";
  if (property?.$ref?.endsWith("source-ref.schema.json")) return "array";
  return undefined;
}
