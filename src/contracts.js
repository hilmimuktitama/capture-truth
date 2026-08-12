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

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");

export const CONTRACT_VERSION = "0.4.1";

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
  source_refs: "array",
  extracted_at: "string",
  derivation_version: "string",
  source_material: "string"
});

export const CLASSIFICATION_METHOD_KEYWORD = "keyword";
export const REVIEW_STATUS_UNREVIEWED = "unreviewed";
export const DERIVATION_VERSION = CONTRACT_VERSION;
export const SOURCE_MATERIAL_VALUES = Object.freeze(["raw_body", "structured_fields", "metadata", "mixed"]);

const HEX64 = /^(?:sha256:)?[a-f0-9]{64}$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;

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
  }
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
  if (value.review_status !== undefined && value.review_status !== REVIEW_STATUS_UNREVIEWED) {
    errors.push(`$.review_status: must be '${REVIEW_STATUS_UNREVIEWED}'`);
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
  for (const key of ["suggested_kind", "extracted_at", "derivation_version", "source_material"]) {
    if (!Object.hasOwn(value, key)) continue;
    const property = properties[key];
    if (!matchesSchemaType(value[key], property.type)) errors.push(`$.${key}: has invalid type`);
    if (property.minLength !== undefined && typeof value[key] === "string" && value[key].length < property.minLength) errors.push(`$.${key}: must be at least ${property.minLength} character(s)`);
    if (property.format === "date-time" && !validDateTime(value[key])) errors.push(`$.${key}: must be a valid full RFC3339 datetime`);
    if (property.const !== undefined && value[key] !== property.const) errors.push(`$.${key}: must equal ${property.const}`);
    if (property.enum && !property.enum.includes(value[key])) errors.push(`$.${key}: has an invalid value`);
  }
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
  if (!value || typeof value !== "object") return ["$: evidence pack must be an object"];
  for (const key of ["kind", "schema_version", "generated_at"]) if (typeof value[key] !== "string" || !value[key]) errors.push(`$.${key}: required non-empty string`);
  if (value.kind !== "capture_truth_evidence_pack") errors.push("$.kind: must be capture_truth_evidence_pack");
  if (value.schema_version !== CONTRACT_VERSION) errors.push(`$.schema_version: must equal ${CONTRACT_VERSION}`);
  if (!Array.isArray(value.sources) || !Array.isArray(value.candidate_claims) || !Array.isArray(value.diagnostics)) errors.push("$: sources, candidate_claims, and diagnostics must be arrays");
  for (const [i, source] of (value.sources ?? []).entries()) errors.push(...validateSourceRecord(source).map((e) => `$.sources[${i}]${e.slice(1)}`));
  for (const [i, claim] of (value.candidate_claims ?? []).entries()) errors.push(...validateCanonicalCandidateClaim(claim).map((e) => `$.candidate_claims[${i}]${e.slice(1)}`));
  if (!validDateTime(value.generated_at)) errors.push("$.generated_at: must be a valid full RFC3339 datetime");
  if (!value.summary || typeof value.summary !== "object" || Array.isArray(value.summary)) errors.push("$.summary: required object");
  for (const key of ["source_count", "candidate_claim_count", "diagnostic_count", "raw_included_count"]) if (!Number.isInteger(value.summary?.[key]) || value.summary[key] < 0) errors.push(`$.summary.${key}: required non-negative integer`);
  for (const [i, diagnostic] of (value.diagnostics ?? []).entries()) {
    if (!diagnostic || typeof diagnostic !== "object" || typeof diagnostic.type !== "string" || !["info", "warning", "error"].includes(diagnostic.severity) || typeof diagnostic.message !== "string") errors.push(`$.diagnostics[${i}]: requires type, severity, and message`);
    if (diagnostic?.source_id !== undefined && typeof diagnostic.source_id !== "string") errors.push(`$.diagnostics[${i}].source_id: must be string`);
    if (diagnostic && Object.keys(diagnostic).some((key) => !["type", "severity", "source_id", "message"].includes(key))) errors.push(`$.diagnostics[${i}]: unknown property`);
  }
  return errors;
}

export function assertEvidencePack(value) { raiseOnErrors(validateEvidencePack(value), "evidence pack"); return value; }

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
  return types.some((candidate) => candidate === "string" ? typeof value === "string" : candidate === "null" ? value === null : candidate === "object" ? value && typeof value === "object" && !Array.isArray(value) : candidate === "array" ? Array.isArray(value) : candidate === "boolean" ? typeof value === "boolean" : candidate === "number" ? typeof value === "number" : true);
}
