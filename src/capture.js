import { CONTRACT_VERSION } from "./contracts.js";
import { extractCandidateClaims, classifySuggestedKind } from "./candidate-extraction.js";
import {
  canonicalLocator,
  compact,
  diagnostic,
  normalizeSourceRecord,
  hashContent,
  rawInput
} from "./source-normalization.js";
import { validClock, normalizeTimestamp, isValidTimestamp } from "./timestamp.js";
import { reviewCandidateClaim } from "./candidate-review.js";
import {
  buildProfileExport,
  DEFAULT_REDACTION_PATTERNS,
  EXPORT_PROFILES,
  MAX_PORTABLE_CANDIDATE_BYTES,
  PORTABLE_PROFILES,
  RAW_LOCAL_ONLY_PROFILE
} from "./portable-export.js";
import { redactPatterns, sanitizeCredentialUrls } from "./redaction.js";

export const PACKAGE_VERSION = "0.5.0";
export const CLASSIFICATION_METHOD = "keyword";
export const REVIEW_STATUS = "unreviewed";

export function createEvidencePack({ sources = [], now = () => new Date() } = {}) {
  const clock = validClock(now());
  const diagnostics = [];
  const sourceIds = new Set();
  const normalizedSources = sources.map((input) => {
    const record = normalizeSourceRecord(input, { now: () => clock, diagnostics });
    if (sourceIds.has(record.id)) {
      diagnostic(diagnostics, "duplicate_source_id", "warning", record.id, `Duplicate source id: ${record.id}.`);
    }
    sourceIds.add(record.id);
    return record;
  });

  const claims = [];
  const claimIds = new Set();
  sources.forEach((input, index) => {
    const extractionInput = {
      ...normalizedSources[index],
      ...(rawInput(input)),
      fields: plainObject(input?.fields ?? normalizedSources[index].fields),
      metadata: plainObject(input?.metadata ?? normalizedSources[index].metadata)
    };
    for (const claim of extractCandidateClaims(extractionInput, { now: () => clock })) {
      if (claimIds.has(claim.id)) {
        diagnostic(
          diagnostics,
          "duplicate_candidate_id",
          "warning",
          claim.source_refs[0]?.source_id,
          `Duplicate candidate id: ${claim.id}.`
        );
      } else {
        claimIds.add(claim.id);
        claims.push(claim);
      }
    }
  });

  return {
    kind: "capture_truth_evidence_pack",
    schema_version: CONTRACT_VERSION,
    generated_at: clock.toISOString(),
    sources: normalizedSources,
    candidate_claims: claims,
    diagnostics,
    summary: {
      source_count: normalizedSources.length,
      candidate_claim_count: claims.length,
      diagnostic_count: diagnostics.length,
      raw_included_count: normalizedSources.filter((source) => source.raw_included).length
    }
  };
}

/** @deprecated Compatibility alias for createEvidencePack. */
export const captureSources = createEvidencePack;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export {
  buildProfileExport,
  canonicalLocator,
  classifySuggestedKind,
  DEFAULT_REDACTION_PATTERNS,
  extractCandidateClaims,
  hashContent,
  isValidTimestamp,
  MAX_PORTABLE_CANDIDATE_BYTES,
  normalizeSourceRecord,
  normalizeTimestamp,
  PORTABLE_PROFILES,
  RAW_LOCAL_ONLY_PROFILE,
  redactPatterns,
  reviewCandidateClaim,
  sanitizeCredentialUrls,
  EXPORT_PROFILES
};
