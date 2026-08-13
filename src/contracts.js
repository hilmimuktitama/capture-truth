// src/contracts.js
//
// Canonical shared contract schemas for capture-truth and truth-tools.
//
// The canonical artifacts live in schemas/*.json. This module loads those
// copies at runtime (no JSON import attributes, no extra dependencies) and
// provides dependency-free validators used by capture, tests, and the
// contracts-verify script. The truth-tools repository keeps its own copies of
// schemas/*.json; compatibility is maintained by copying, never by an
// unpublishable runtime dependency. Run `npm run contracts:verify` to detect
// drift between the copies, the validators, and the fixtures.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rawLikeKey } from "./redaction.js";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");

export const CONTRACT_VERSION = "0.5.0";

export const SOURCE_SCHEMA = Object.freeze(loadSchema("source.schema.json"));
export const SOURCE_REF_SCHEMA = Object.freeze(loadSchema("source-ref.schema.json"));
export const CANDIDATE_CLAIM_SCHEMA = Object.freeze(loadSchema("candidate-claim.schema.json"));

// Portable shared requirements. Internal capture records may carry raw and
// other extensions, but those are not canonical Source records.
export const SOURCE_REQUIRED = ["id", "type", "observed_at"];
export const SOURCE_REF_REQUIRED = ["source_id", "locator"];
export const CANDIDATE_CLAIM_REQUIRED = ["id", "text", "classification_method", "review_status", "source_refs", "derivation_version", "source_material"];

// Declared property-type contracts. The contracts-verify script compares these
// against schemas/*.json so that property-type drift (for example a required
// locator declared nullable in the schema) is caught in CI.
export const SOURCE_PROPERTY_TYPES = Object.freeze({
  id: "string",
  kind: "string",
  type: "string",
  adapter: "string",
  key: ["string", "null"],
  url: ["string", "null"],
  path: ["string", "null"],
  observed_at: "string",
  source_updated_at: ["string", "null"],
  revision: ["string", "number", "null"],
  content_hash: ["string", "null"],
  locator: ["string", "null"],
  access_caveats: "array",
  raw_included: "boolean",
  fields: "object",
  metadata: "object",
  owner: "string"
});

export const SOURCE_REF_PROPERTY_TYPES = Object.freeze({
  source_id: "string",
  locator: "string",
  path: ["string", "null"],
  url: ["string", "null"],
  observed_at: ["string", "null"],
  source_updated_at: ["string", "null"],
  revision: ["string", "number", "null"],
  content_hash: ["string", "null"]
});

export const CANDIDATE_CLAIM_PROPERTY_TYPES = Object.freeze({
  id: "string",
  text: "string",
  suggested_kind: ["string", "null"],
  classification_method: "string",
  review_status: "string",
  reviewed_by: ["string", "null"],
  reviewed_at: ["string", "null"],
  source_refs: "array",
  extracted_at: "string",
  derivation_version: "string",
  source_material: "string"
});

export const CLASSIFICATION_METHOD_KEYWORD = "keyword";
export const REVIEW_STATUS_UNREVIEWED = "unreviewed";
export const REVIEW_STATUS_APPROVED = "approved_for_portable";
export const REVIEW_STATUS_REJECTED = "rejected";
export const REVIEW_STATUS_VALUES = Object.freeze([REVIEW_STATUS_UNREVIEWED, REVIEW_STATUS_APPROVED, REVIEW_STATUS_REJECTED]);
export const DERIVATION_VERSION = CONTRACT_VERSION;
export const SOURCE_MATERIAL_VALUES = Object.freeze(["raw_body", "structured_fields", "metadata", "mixed"]);

const PROFILE_FLAGS = Object.freeze({
  "portable-summary": Object.freeze({ portable: true, local_only: false }),
  "repo-safe-summary": Object.freeze({ portable: true, local_only: false }),
  "internal-evidence-pack": Object.freeze({ portable: true, local_only: false }),
  "raw-local-only": Object.freeze({ portable: false, local_only: true })
});

const HEX64 = /^(?:sha256:)?[a-f0-9]{64}$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;
const URL_PATTERN = /^https?:\/\//i;
const URL_SCHEME = /^([a-z][a-z\d+.-]*):/i;

export function validateSourceRecord(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["$: source record must be an object"];
  }
  for (const key of SOURCE_REQUIRED) {
    if (key === "raw_included") continue; // boolean; checked below
    if (typeof value[key] !== "string" || value[key].length === 0) {
      errors.push(`$.${key}: required non-empty string`);
    }
  }
  if (Object.hasOwn(value, "raw_included") && typeof value.raw_included !== "boolean") {
    errors.push("$.raw_included: must be boolean when present");
  }
  if (value.content_hash !== undefined && value.content_hash !== null && !HEX64.test(value.content_hash)) {
    errors.push("$.content_hash: must be a sha256 hex digest (64 lowercase hex characters), optionally prefixed with sha256:");
  }
  if (Object.hasOwn(value, "captured_at")) {
    errors.push("$.captured_at: deprecated; must be normalized to observed_at and never appears in a normalized record");
  }
  if (value.kind !== undefined && !["document", "record"].includes(value.kind)) {
    errors.push("$.kind: must be 'document' or 'record'");
  }
  if (value.observed_at !== undefined && !validDateTime(value.observed_at)) {
    errors.push("$.observed_at: must be a valid full RFC3339 datetime with Z or UTC offset");
  }
  if (value.source_updated_at !== undefined && value.source_updated_at !== null && !validDateTime(value.source_updated_at)) {
    errors.push("$.source_updated_at: must be a valid full RFC3339 datetime with Z or UTC offset, or null");
  }
  if (value.access_caveats !== undefined && !Array.isArray(value.access_caveats)) {
    errors.push("$.access_caveats: must be an array");
  } else if (Array.isArray(value.access_caveats) && value.access_caveats.some((entry) => typeof entry !== "string")) {
    errors.push("$.access_caveats: entries must be strings");
  }
  if (value.url !== undefined && value.url !== null && (typeof value.url !== "string" || !URL_PATTERN.test(value.url))) errors.push("$.url: must be null or an HTTP(S) URL");
  if (value.path !== undefined && value.path !== null && (typeof value.path !== "string" || unsafeUrlScheme(value.path))) errors.push("$.path: must be null or a safe path/HTTP(S) URL");
  if (value.owner !== undefined && typeof value.owner !== "string") errors.push("$.owner: must be a string");
  if (value.revision !== undefined && value.revision !== null && !["string", "number"].includes(typeof value.revision)) errors.push("$.revision: must be string, number, or null");
  for (const key of ["fields", "metadata"]) {
    if (value[key] !== undefined) errors.push(...validateMetadataObject(value[key], `$.${key}`));
  }
  for (const key of ["kind", "type", "adapter", "key", "locator"]) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== "string") errors.push(`$.${key}: must be a string or null`);
  }
  if (value.locator !== undefined && value.locator !== null && unsafeUrlScheme(value.locator)) errors.push("$.locator: must not use an unsafe URL scheme");
  for (const key of Object.keys(value)) {
    if (rawLikeKey(key) && key !== "raw") errors.push(`$.${key}: raw-like top-level properties are forbidden`);
  }
  // Internal capture records may retain raw material for the local-only
  // profile. Canonical Source validation below explicitly removes this
  // extension before publication.
  const allowedSourceRecord = new Set([...Object.keys(SOURCE_SCHEMA.properties), "raw"]);
  for (const key of Object.keys(value)) if (!allowedSourceRecord.has(key)) errors.push(`$.${key}: unknown source record property`);
  validateSchemaProperties(value, SOURCE_SCHEMA, "$", errors);
  // Raw inclusion invariant: raw bodies exist exactly when raw_included is true.
  if (value.raw_included === false && Object.hasOwn(value, "raw")) {
    errors.push("$.raw: raw_included=false requires raw to be absent");
  }
  if (value.raw_included === true && !Object.hasOwn(value, "raw")) {
    errors.push("$.raw: raw_included=true requires raw to be present");
  }
  return errors;
}

export function assertSourceRecord(value) {
  raiseOnErrors(validateSourceRecord(value), "source record");
  return value;
}

export function validateCanonicalSource(value) {
  const errors = validateSourceRecord(value);
  if (value && typeof value === "object") {
    if (Object.hasOwn(value, "raw")) errors.push("$.raw: raw is never part of canonical Source");
    const allowed = new Set(Object.keys(SOURCE_SCHEMA.properties));
    for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`$.${key}: unknown canonical Source property`);
  }
  return errors;
}

export function assertCanonicalSource(value) {
  raiseOnErrors(validateCanonicalSource(value), "canonical source record");
  return value;
}

export function validateSourceRef(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["$: source reference must be an object"];
  }
  for (const key of SOURCE_REF_REQUIRED) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      errors.push(`$.${key}: required non-empty string`);
    }
  }
  if (value.content_hash !== undefined && value.content_hash !== null && !HEX64.test(value.content_hash)) {
    errors.push("$.content_hash: must be a sha256 hex digest (64 lowercase hex characters), optionally prefixed with sha256:");
  }
  for (const key of ["url"]) if (value[key] !== undefined && value[key] !== null && (typeof value[key] !== "string" || !URL_PATTERN.test(value[key]))) errors.push(`$.${key}: must be null or an HTTP(S) URL`);
  if (value.path !== undefined && value.path !== null && (typeof value.path !== "string" || unsafeUrlScheme(value.path))) errors.push("$.path: must be null or a safe path/HTTP(S) URL");
  if (value.locator !== undefined && unsafeUrlScheme(value.locator)) errors.push("$.locator: must not use an unsafe URL scheme");
  for (const key of ["observed_at", "source_updated_at"]) {
    if (value[key] !== undefined && value[key] !== null && !validDateTime(value[key])) {
      errors.push(`$.${key}: must be a valid full RFC3339 datetime with Z or UTC offset, or null`);
    }
  }
  const properties = SOURCE_REF_SCHEMA.properties;
  for (const key of Object.keys(properties)) {
    if (!Object.hasOwn(value, key)) continue;
    const property = properties[key];
    if (!matchesSchemaType(value[key], property.type)) errors.push(`$.${key}: has invalid type`);
    if (property.minLength !== undefined && typeof value[key] === "string" && value[key].length < property.minLength) errors.push(`$.${key}: must be at least ${property.minLength} character(s)`);
    if (property.minimum !== undefined && (!Number.isInteger(value[key]) || value[key] < property.minimum)) errors.push(`$.${key}: must be an integer >= ${property.minimum}`);
    if (property.pattern && typeof value[key] === "string" && !new RegExp(property.pattern).test(value[key])) errors.push(`$.${key}: has an invalid format`);
    if (property.format === "date-time" && value[key] !== null && !validDateTime(value[key])) errors.push(`$.${key}: must be a valid full RFC3339 datetime`);
  }
  validateSchemaProperties(value, SOURCE_REF_SCHEMA, "$", errors);
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(properties, key)) errors.push(`$.${key}: unknown canonical SourceRef property`);
  }
  return errors;
}

export function assertSourceRef(value) {
  raiseOnErrors(validateSourceRef(value), "source reference");
  return value;
}

export function validateCandidateClaim(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["$: candidate claim must be an object"];
  }
  for (const key of CANDIDATE_CLAIM_REQUIRED) {
    if (["derivation_version", "source_material"].includes(key)) continue;
    if (key === "source_refs") {
      if (!Array.isArray(value.source_refs) || value.source_refs.length === 0) {
        errors.push("$.source_refs: required non-empty array");
      } else {
        for (const [index, ref] of value.source_refs.entries()) {
          errors.push(...validateSourceRef(ref).map((error) => `$.source_refs[${index}]${error.slice(1)}`));
        }
      }
      continue;
    }
    if (typeof value[key] !== "string" || value[key].length === 0) {
      errors.push(`$.${key}: required non-empty string`);
    }
  }
  if (value.classification_method !== undefined && value.classification_method !== CLASSIFICATION_METHOD_KEYWORD) {
    errors.push(`$.classification_method: must be '${CLASSIFICATION_METHOD_KEYWORD}'`);
  }
  if (value.review_status !== undefined && !REVIEW_STATUS_VALUES.includes(value.review_status)) {
    errors.push(`$.review_status: must be one of ${REVIEW_STATUS_VALUES.join(", ")}`);
  }
  if ([REVIEW_STATUS_APPROVED, REVIEW_STATUS_REJECTED].includes(value.review_status)) {
    for (const key of ["reviewed_by", "reviewed_at"]) {
      if (typeof value[key] !== "string" || value[key].trim().length === 0) errors.push(`$.${key}: required non-empty string for reviewed candidates`);
    }
    if (typeof value.reviewed_at === "string" && !validDateTime(value.reviewed_at)) errors.push("$.reviewed_at: must be a valid full RFC3339 datetime");
  }
  if (value.derivation_version !== DERIVATION_VERSION) {
    errors.push(`$.derivation_version: must equal ${DERIVATION_VERSION}`);
  }
  if (!SOURCE_MATERIAL_VALUES.includes(value.source_material)) {
    errors.push(`$.source_material: must be one of ${SOURCE_MATERIAL_VALUES.join(", ")}`);
  }
  if (Object.hasOwn(value, "kind")) {
    errors.push("$.kind: candidate claims must never carry a final kind; use optional suggested_kind instead");
  }
  const properties = CANDIDATE_CLAIM_SCHEMA.properties;
  for (const key of ["suggested_kind", "extracted_at", "derivation_version", "source_material", "reviewed_by", "reviewed_at"]) {
    if (!Object.hasOwn(value, key)) continue;
    const property = properties[key] ?? { type: key.startsWith("reviewed_") ? ["string", "null"] : "string" };
    if (!matchesSchemaType(value[key], property.type)) errors.push(`$.${key}: has invalid type`);
    if (property.minLength !== undefined && typeof value[key] === "string" && value[key].length < property.minLength) errors.push(`$.${key}: must be at least ${property.minLength} character(s)`);
    if (property.format === "date-time" && value[key] !== null && !validDateTime(value[key])) errors.push(`$.${key}: must be a valid full RFC3339 datetime`);
    if (property.const !== undefined && value[key] !== property.const) errors.push(`$.${key}: must equal ${property.const}`);
    if (property.enum && !property.enum.includes(value[key])) errors.push(`$.${key}: has an invalid value`);
  }
  validateSchemaProperties(value, CANDIDATE_CLAIM_SCHEMA, "$", errors);
  return errors;
}

export function assertCandidateClaim(value) {
  raiseOnErrors(validateCandidateClaim(value), "candidate claim");
  return value;
}

export function validateCanonicalCandidateClaim(value) {
  const errors = validateCandidateClaim(value);
  if (value && typeof value === "object") {
    const allowed = new Set(Object.keys(CANDIDATE_CLAIM_SCHEMA.properties));
    for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`$.${key}: unknown canonical CandidateClaim property`);
    for (const [index, ref] of (value.source_refs ?? []).entries()) {
      const allowedRef = new Set(Object.keys(SOURCE_REF_SCHEMA.properties));
      for (const key of Object.keys(ref ?? {})) if (!allowedRef.has(key)) errors.push(`$.source_refs[${index}].${key}: unknown canonical SourceRef property`);
    }
  }
  return errors;
}

export function assertCanonicalCandidateClaim(value) {
  raiseOnErrors(validateCanonicalCandidateClaim(value), "canonical candidate claim");
  return value;
}

export function contractFixtures() {
  return {
    CONTRACT_VERSION,
    SOURCE_REQUIRED,
    SOURCE_REF_REQUIRED,
    CANDIDATE_CLAIM_REQUIRED,
    CLASSIFICATION_METHOD_KEYWORD,
    REVIEW_STATUS_UNREVIEWED,
    DERIVATION_VERSION,
    SOURCE_MATERIAL_VALUES
  };
}

function loadSchema(file) {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, file), "utf8"));
}

function validDateTime(value) {
  if (typeof value !== "string") return false;
  const match = DATE_TIME.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , zone, offsetHour, offsetMinute] = match;
  return Number(month) >= 1 && Number(month) <= 12
    && Number(day) >= 1 && Number(day) <= daysInMonth(Number(year), Number(month))
    && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
    && (zone === "Z" || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59));
}

export function validateEvidencePack(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["$: evidence pack must be an object"];
  const allowed = new Set(["kind", "schema_version", "profile", "portable", "local_only", "generated_at", "sources", "candidate_claims", "diagnostics", "summary"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`$.${key}: unknown evidence pack property`);
  for (const key of ["kind", "schema_version", "generated_at"]) if (typeof value[key] !== "string" || !value[key]) errors.push(`$.${key}: required non-empty string`);
  if (!["capture_truth_evidence_pack", "capture_truth_export"].includes(value.kind)) errors.push("$.kind: must be capture_truth_evidence_pack or capture_truth_export");
  if (value.schema_version !== CONTRACT_VERSION) errors.push(`$.schema_version: must equal ${CONTRACT_VERSION}`);
  if (value.profile !== undefined && typeof value.profile !== "string") errors.push("$.profile: must be a string");
  if (value.portable !== undefined && typeof value.portable !== "boolean") errors.push("$.portable: must be boolean");
  if (value.local_only !== undefined && typeof value.local_only !== "boolean") errors.push("$.local_only: must be boolean");
  if (!Array.isArray(value.sources) || !Array.isArray(value.candidate_claims) || !Array.isArray(value.diagnostics)) errors.push("$: sources, candidate_claims, and diagnostics must be arrays");
  for (const [i, source] of (value.sources ?? []).entries()) errors.push(...validateSourceRecord(source).map((e) => `$.sources[${i}]${e.slice(1)}`));
  const sourceIds = new Set();
  for (const [i, source] of (value.sources ?? []).entries()) {
    if (typeof source?.id === "string" && sourceIds.has(source.id)) errors.push(`$.sources[${i}].id: duplicate source id`);
    if (typeof source?.id === "string") sourceIds.add(source.id);
  }
  const candidateIds = new Set();
  for (const [i, claim] of (value.candidate_claims ?? []).entries()) {
    errors.push(...validateCanonicalCandidateClaim(claim).map((e) => `$.candidate_claims[${i}]${e.slice(1)}`));
    if (typeof claim?.id === "string" && candidateIds.has(claim.id)) errors.push(`$.candidate_claims[${i}].id: duplicate candidate id`);
    if (typeof claim?.id === "string") candidateIds.add(claim.id);
  }
  if (!validDateTime(value.generated_at)) errors.push("$.generated_at: must be a valid full RFC3339 datetime");
  if (!value.summary || typeof value.summary !== "object" || Array.isArray(value.summary)) errors.push("$.summary: required object");
  for (const key of ["source_count", "candidate_claim_count", "diagnostic_count", "raw_included_count"]) if (!Number.isInteger(value.summary?.[key]) || value.summary[key] < 0) errors.push(`$.summary.${key}: required non-negative integer`);
  for (const key of Object.keys(value.summary ?? {})) if (!["source_count", "candidate_claim_count", "diagnostic_count", "raw_included_count", "omitted_source_count", "omitted_candidate_count", "omitted_diagnostic_count", "omission_reasons"].includes(key)) errors.push(`$.summary.${key}: unknown evidence pack summary property`);
  if (value.summary?.omitted_candidate_count !== undefined && (!Number.isInteger(value.summary.omitted_candidate_count) || value.summary.omitted_candidate_count < 0)) errors.push("$.summary.omitted_candidate_count: required non-negative integer");
  if (value.summary?.omission_reasons !== undefined && (!value.summary.omission_reasons || typeof value.summary.omission_reasons !== "object" || Array.isArray(value.summary.omission_reasons) || Object.values(value.summary.omission_reasons).some((count) => !Number.isInteger(count) || count < 0))) errors.push("$.summary.omission_reasons: must contain non-negative integer counts");
  if (value.summary?.source_count !== undefined && value.summary.source_count !== value.sources?.length) errors.push("$.summary.source_count: does not match sources length");
  if (value.summary?.candidate_claim_count !== undefined && value.summary.candidate_claim_count !== value.candidate_claims?.length) errors.push("$.summary.candidate_claim_count: does not match candidate_claims length");
  if (value.summary?.diagnostic_count !== undefined && value.summary.diagnostic_count !== value.diagnostics?.length) errors.push("$.summary.diagnostic_count: does not match diagnostics length");
  if (value.summary?.raw_included_count !== undefined && value.summary.raw_included_count !== (value.sources ?? []).filter((source) => source?.raw_included === true).length) errors.push("$.summary.raw_included_count: does not match sources");
  for (const [i, diagnostic] of (value.diagnostics ?? []).entries()) {
    if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic) || typeof diagnostic.type !== "string" || !diagnostic.type || !["info", "warning", "error"].includes(diagnostic.severity) || typeof diagnostic.message !== "string" || !diagnostic.message) errors.push(`$.diagnostics[${i}]: requires type, severity, and message`);
    if (diagnostic?.source_id !== undefined && typeof diagnostic.source_id !== "string") errors.push(`$.diagnostics[${i}].source_id: must be string`);
    if (diagnostic && Object.keys(diagnostic).some((key) => !["type", "severity", "source_id", "message"].includes(key))) errors.push(`$.diagnostics[${i}]: unknown property`);
  }
  return errors;
}

export function assertEvidencePack(value) { raiseOnErrors(validateEvidencePack(value), "evidence pack"); return value; }

export function validateProfileExport(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["$: profile export must be an object"];
  const allowed = new Set(["kind", "schema_version", "profile", "portable", "local_only", "generated_at", "sources", "candidate_claims", "diagnostics", "summary"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`$.${key}: unknown profile export property`);
  if (value.kind !== "capture_truth_export") errors.push("$.kind: must be capture_truth_export");
  if (value.schema_version !== CONTRACT_VERSION) errors.push(`$.schema_version: must equal ${CONTRACT_VERSION}`);
  if (typeof value.profile !== "string" || !Object.hasOwn(PROFILE_FLAGS, value.profile)) errors.push("$.profile: must be a supported export profile");
  if (typeof value.portable !== "boolean") errors.push("$.portable: must be boolean");
  if (typeof value.local_only !== "boolean") errors.push("$.local_only: must be boolean");
  if (value.portable === value.local_only) errors.push("$: portable and local_only must be opposites");
  const expectedFlags = PROFILE_FLAGS[value.profile];
  if (expectedFlags && value.portable !== expectedFlags.portable) errors.push(`$.portable: ${value.profile} must set portable=${expectedFlags.portable}`);
  if (expectedFlags && value.local_only !== expectedFlags.local_only) errors.push(`$.local_only: ${value.profile} must set local_only=${expectedFlags.local_only}`);
  if (!validDateTime(value.generated_at)) errors.push("$.generated_at: must be a valid full RFC3339 datetime");
  if (!Array.isArray(value.sources) || !Array.isArray(value.candidate_claims) || !Array.isArray(value.diagnostics)) {
    errors.push("$: sources, candidate_claims, and diagnostics must be arrays");
  }
  const sources = value.sources ?? [];
  const sourceIds = new Set();
  for (const [i, source] of sources.entries()) {
    errors.push(...validateSourceRecord(source).map((e) => `$.sources[${i}]${e.slice(1)}`));
    if (sourceIds.has(source?.id)) errors.push(`$.sources[${i}].id: duplicate source id`);
    sourceIds.add(source?.id);
  }
  const claims = value.candidate_claims ?? [];
  const candidateIds = new Set();
  for (const [i, claim] of claims.entries()) {
    errors.push(...validateCanonicalCandidateClaim(claim).map((e) => `$.candidate_claims[${i}]${e.slice(1)}`));
    if (typeof claim?.id === "string" && candidateIds.has(claim.id)) errors.push(`$.candidate_claims[${i}].id: duplicate candidate id`);
    if (typeof claim?.id === "string") candidateIds.add(claim.id);
  }
  validateExportDiagnostics(value.diagnostics ?? [], errors);
  if (value.portable && sources.some((source) => source?.raw_included === true || Object.hasOwn(source ?? {}, "raw"))) errors.push("$: exports containing raw material cannot be portable");
  if (value.profile === "portable-summary" && sources.length !== 0) errors.push("$.sources: portable-summary must not include source records");
  if (value.profile === "internal-evidence-pack") {
    for (const [i, source] of sources.entries()) if (source?.raw_included === true || Object.hasOwn(source ?? {}, "raw")) errors.push(`$.sources[${i}]: internal-evidence-pack must omit raw material`);
    for (const [i, claim] of claims.entries()) if (claim?.review_status !== REVIEW_STATUS_UNREVIEWED || ["raw_body", "mixed"].includes(claim?.source_material)) errors.push(`$.candidate_claims[${i}]: invalid internal-evidence-pack candidate`);
  }
  if (value.profile === "portable-summary") {
    for (const [i, claim] of claims.entries()) if (claim?.review_status !== REVIEW_STATUS_APPROVED || ["raw_body", "mixed"].includes(claim?.source_material)) errors.push(`$.candidate_claims[${i}]: invalid portable-summary candidate`);
  }
  const summary = value.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    errors.push("$.summary: required object");
  } else {
    for (const key of ["source_count", "candidate_claim_count", "diagnostic_count", "raw_included_count", "omitted_source_count", "omitted_candidate_count", "omitted_diagnostic_count"]) {
      if (!Number.isInteger(summary[key]) || summary[key] < 0) errors.push(`$.summary.${key}: required non-negative integer`);
    }
    if (summary.source_count !== sources.length) errors.push("$.summary.source_count: does not match included sources length");
    if (summary.candidate_claim_count !== claims.length) errors.push("$.summary.candidate_claim_count: does not match included candidate_claims length");
    if (summary.diagnostic_count !== (value.diagnostics ?? []).length) errors.push("$.summary.diagnostic_count: does not match included diagnostics length");
    if (summary.raw_included_count !== sources.filter((source) => source?.raw_included === true).length) errors.push("$.summary.raw_included_count: does not match included sources");
    if (Object.values(summary.omission_reasons ?? {}).some((count) => !Number.isInteger(count) || count < 0)) errors.push("$.summary.omission_reasons: must contain non-negative integer counts");
    const omittedByReason = Object.values(summary.omission_reasons ?? {}).reduce((sum, count) => sum + count, 0);
    if (summary.omitted_candidate_count !== omittedByReason) errors.push("$.summary.omitted_candidate_count: does not match omission reasons");
  }
  return errors;
}

export function assertProfileExport(value) { raiseOnErrors(validateProfileExport(value), "profile export"); return value; }

function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function raiseOnErrors(errors, label) {
  if (errors.length === 0) return;
  throw new Error(`Invalid ${label}: ${errors[0]}`);
}

function matchesSchemaType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => candidate === "string" ? typeof value === "string" : candidate === "null" ? value === null : candidate === "object" ? value && typeof value === "object" && !Array.isArray(value) : candidate === "array" ? Array.isArray(value) : candidate === "boolean" ? typeof value === "boolean" : candidate === "number" ? typeof value === "number" && Number.isFinite(value) : true);
}

function validateSchemaProperties(value, schema, path, errors) {
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (!Object.hasOwn(value, key) || !property) continue;
    validateSchemaValue(value[key], property, `${path}.${key}`, errors, schema);
  }
}

function validateSchemaValue(value, schema, path, errors, rootSchema) {
  if (schema.$ref) {
    const resolved = resolveSchemaRef(schema.$ref, rootSchema);
    if (resolved) validateSchemaValue(value, resolved, path, errors, resolved === SOURCE_SCHEMA ? SOURCE_SCHEMA : resolved === SOURCE_REF_SCHEMA ? SOURCE_REF_SCHEMA : rootSchema);
    return;
  }
  if (schema.anyOf) {
    const branchErrors = schema.anyOf.map((branch) => {
      const branchResult = [];
      validateSchemaValue(value, branch, path, branchResult, rootSchema);
      return branchResult;
    });
    if (!branchErrors.some((branch) => branch.length === 0)) errors.push(...(branchErrors[0] ?? []));
    return;
  }

  if (schema.type !== undefined && !matchesSchemaType(value, schema.type)) {
    errors.push(`${path}: has invalid type`);
    return;
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: must be at least ${schema.minLength} character(s)`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: must be at most ${schema.maxLength} character(s)`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: has an invalid format`);
    if (schema.format === "date-time" && !validDateTime(value)) errors.push(`${path}: must be a valid full RFC3339 datetime`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: must contain at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: must contain at most ${schema.maxItems} item(s)`);
    if (schema.items) value.forEach((entry, index) => validateSchemaValue(entry, schema.items, `${path}[${index}]`, errors, rootSchema));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) errors.push(`${path}: must contain at most ${schema.maxProperties} propert${schema.maxProperties === 1 ? "y" : "ies"}`);
    for (const [key, entry] of Object.entries(value)) {
      if (schema.propertyNames) validateSchemaValue(key, schema.propertyNames, `${path}.${key}`, errors, rootSchema);
      if (schema.additionalProperties && schema.additionalProperties.$ref) validateSchemaValue(entry, schema.additionalProperties, `${path}.${key}`, errors, rootSchema);
    }
  }
  if (schema.minimum !== undefined && (!Number.isInteger(value) || value < schema.minimum)) errors.push(`${path}: must be an integer >= ${schema.minimum}`);
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must equal ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: has an invalid value`);
  if (schema.not) {
    const notErrors = [];
    validateSchemaValue(value, schema.not, path, notErrors, rootSchema);
    if (notErrors.length === 0) errors.push(`${path}: must not match the forbidden schema`);
  }
}

function resolveSchemaRef(ref, rootSchema) {
  if (ref === "https://truth-tools.dev/schemas/source-ref.schema.json") return SOURCE_REF_SCHEMA;
  if (ref.startsWith("https://truth-tools.dev/schemas/source-ref.schema.json#")) return resolvePointer(SOURCE_REF_SCHEMA, ref.slice(ref.indexOf("#")));
  if (!ref.startsWith("#")) return null;
  return resolvePointer(rootSchema, ref);
}

function resolvePointer(schema, pointer) {
  return pointer.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~")).reduce((current, key) => current?.[key], schema);
}

function unsafeUrlScheme(value) {
  const text = String(value).trim();
  if (/^[a-z]:[\\/]/i.test(text)) return false;
  const match = URL_SCHEME.exec(text);
  return Boolean(match && !/^https?$/i.test(match[1]));
}

function validateExportDiagnostics(diagnostics, errors) {
  for (const [i, diagnostic] of diagnostics.entries()) {
    if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic) || typeof diagnostic.type !== "string" || !diagnostic.type || !["info", "warning", "error"].includes(diagnostic.severity) || typeof diagnostic.message !== "string" || !diagnostic.message) {
      errors.push(`$.diagnostics[${i}]: requires type, severity, and message`);
    }
    if (diagnostic?.source_id !== undefined && typeof diagnostic.source_id !== "string") errors.push(`$.diagnostics[${i}].source_id: must be string`);
    if (diagnostic && Object.keys(diagnostic).some((key) => !["type", "severity", "source_id", "message"].includes(key))) errors.push(`$.diagnostics[${i}]: unknown property`);
  }
}

function validateMetadataObject(value, path) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path}: must be an object`];
  if (Object.keys(value).length > 100) errors.push(`${path}: must contain at most 100 properties`);
  for (const [key, entry] of Object.entries(value)) {
    if (rawKey(key)) errors.push(`${path}.${key}: raw-like keys are forbidden`);
    errors.push(...validateMetadataValue(entry, `${path}.${key}`));
  }
  return errors;
}

function validateMetadataValue(value, path) {
  if (value === null || typeof value === "boolean") return [];
  if (typeof value === "string") return value.length <= 2048 ? [] : [`${path}: must be at most 2048 characters`];
  if (typeof value === "number") return Number.isFinite(value) ? [] : [`${path}: must be a finite number`];
  if (Array.isArray(value)) return [
    ...(value.length > 100 ? [`${path}: must contain at most 100 items`] : []),
    ...value.flatMap((entry, index) => validateMetadataValue(entry, `${path}[${index}]`))
  ];
  return validateMetadataObject(value, path);
}

function rawKey(key) {
  return /^(?:content|body|raw|raw_?body|raw_?content|payload|document|description|description_?markdown|message|html|markdown|prose|blob|contents?|text|data)$/i.test(String(key))
    || /(?:^|_)(?:content|raw|payload|document|description|message|html|markdown|prose|blob|text|data)(?:$|_)/i.test(String(key));
}
