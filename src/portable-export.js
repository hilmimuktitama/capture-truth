import {
  CONTRACT_VERSION,
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_UNREVIEWED,
  validateCanonicalCandidateClaim,
  validateEvidencePack,
  validateProfileExport
} from "./contracts.js";
import { validateCandidateDerivation } from "./derivation-validation.js";
import {
  DEFAULT_REDACTION_PATTERNS,
  redactAllowlistedClaim,
  redactAllowlistedSource,
  redactDiagnostic
} from "./redaction.js";
import { assertSafeUrlSchemes } from "./redaction.js";
import { validateSourceRecord } from "./contracts.js";

export const EXPORT_PROFILES = Object.freeze([
  "portable-summary",
  "internal-evidence-pack",
  "raw-local-only",
  "repo-safe-summary"
]);
export const PORTABLE_PROFILES = Object.freeze([
  "portable-summary",
  "internal-evidence-pack",
  "repo-safe-summary"
]);
export const RAW_LOCAL_ONLY_PROFILE = "raw-local-only";
export const MAX_PORTABLE_CANDIDATE_BYTES = 8192;

export function buildProfileExport(pack, profile, { portable = profile !== RAW_LOCAL_ONLY_PROFILE } = {}) {
  if (!EXPORT_PROFILES.includes(profile)) throw new Error(`Unsupported capture export profile: ${profile}`);
  if (profile === RAW_LOCAL_ONLY_PROFILE && portable) {
    throw new Error("raw-local-only exports must stay local; refused portable output.");
  }
  const packErrors = validateEvidencePack(pack);
  if (packErrors.length) throw new Error(`Cannot export invalid evidence pack: ${packErrors[0]}`);
  const sourceIds = new Set();
  for (const source of pack.sources) {
    if (sourceIds.has(source.id)) throw new Error(`Cannot export invalid evidence pack: duplicate source id ${source.id}`);
    sourceIds.add(source.id);
  }
  for (const source of pack.sources) {
    assertSafeUrlSchemes(source);
    const sourceErrors = validateSourceRecord(source);
    if (sourceErrors.length) throw new Error(`Cannot export invalid source: ${sourceErrors[0]}`);
  }

  const alias = profile === "repo-safe-summary";
  const effectiveProfile = alias ? "portable-summary" : profile;
  const portableProfile = effectiveProfile !== RAW_LOCAL_ONLY_PROFILE;
  const redaction = { changed: false };
  const diagnostics = (pack.diagnostics ?? []).map((diagnostic) => redactDiagnostic(diagnostic, redaction));

  if (alias) {
    diagnostics.push({
      type: "deprecated_repo_safe_summary",
      severity: "info",
      message: "repo-safe-summary is deprecated; use portable-summary."
    });
  }

  const sourceById = new Map((pack.sources ?? []).map((source) => [source.id, source]));
  const sources = (pack.sources ?? []).map((source) => redactAllowlistedSource(source, redaction, !portableProfile, portableProfile));
  const claims = [];
  const omissionReasons = {};

  for (const candidate of pack.candidate_claims ?? []) {
    const validationErrors = validateCanonicalCandidateClaim(candidate);
    const derivation = validateCandidateDerivation(candidate, sourceById);
    if (validationErrors.length || !derivation.ok) {
      omitCandidate(
        diagnostics,
        omissionReasons,
        candidate,
        validationErrors.length ? "invalid_candidate_derivation" : "forged_candidate_derivation",
        validationErrors[0] ?? derivation.message
      );
      continue;
    }

    if (portableProfile && ["raw_body", "mixed"].includes(candidate.source_material)) {
      omitCandidate(
        diagnostics,
        omissionReasons,
        candidate,
        `candidate_${candidate.source_material}_excluded`,
        `Candidate claims derived from ${candidate.source_material} are never included in portable output.`
      );
      continue;
    }
    if (effectiveProfile === "portable-summary" && candidate.review_status !== REVIEW_STATUS_APPROVED) {
      omitCandidate(
        diagnostics,
        omissionReasons,
        candidate,
        "candidate_not_approved",
        "Portable summary includes only approved_for_portable candidates."
      );
      continue;
    }
    if (effectiveProfile === "internal-evidence-pack" && candidate.review_status !== REVIEW_STATUS_UNREVIEWED) {
      omitCandidate(
        diagnostics,
        omissionReasons,
        candidate,
        "candidate_not_unreviewed",
        "Internal evidence pack includes only unreviewed candidates."
      );
      continue;
    }

    const rendered = redactAllowlistedClaim(candidate, redaction, portableProfile, effectiveProfile === "portable-summary");
    if (portableProfile && Buffer.byteLength(JSON.stringify(rendered), "utf8") > MAX_PORTABLE_CANDIDATE_BYTES) {
      omitCandidate(
        diagnostics,
        omissionReasons,
        candidate,
        "candidate_too_large",
        `Candidate exceeds the ${MAX_PORTABLE_CANDIDATE_BYTES}-byte portable limit.`
      );
      continue;
    }
    if (portableProfile && !rendered.text) {
      omitCandidate(
        diagnostics,
        omissionReasons,
        candidate,
        "candidate_empty_after_redaction",
        "Candidate became empty after redaction."
      );
      continue;
    }
    claims.push(rendered);
  }

  if (portableProfile && redaction.changed) {
    diagnostics.push({
      type: "redaction_applied",
      severity: "info",
      message: "Pattern redaction changed portable output."
    });
  }

  const output = compact({
    kind: "capture_truth_export",
    schema_version: CONTRACT_VERSION,
    profile: effectiveProfile,
    portable: portableProfile,
    local_only: !portableProfile,
    generated_at: pack.generated_at,
    sources: effectiveProfile === "portable-summary" ? [] : sources,
    candidate_claims: claims,
    diagnostics,
    summary: {
      source_count: effectiveProfile === "portable-summary" ? 0 : sources.length,
      candidate_claim_count: claims.length,
      diagnostic_count: diagnostics.length,
      raw_included_count: effectiveProfile === "raw-local-only" ? sources.filter((source) => source.raw_included === true).length : 0,
      omitted_source_count: effectiveProfile === "portable-summary" ? (pack.sources ?? []).length : 0,
      omitted_candidate_count: Object.values(omissionReasons).reduce((sum, count) => sum + count, 0),
      omission_reasons: omissionReasons,
      omitted_diagnostic_count: 0
    }
  });
  const exportErrors = validateProfileExport(output);
  if (exportErrors.length) throw new Error(`Cannot build invalid profile export: ${exportErrors[0]}`);
  return output;
}

function omitCandidate(diagnostics, reasons, candidate, type, message) {
  reasons[type] = (reasons[type] ?? 0) + 1;
  diagnostics.push(compact({
    type,
    severity: "warning",
    source_id: candidate?.source_refs?.[0]?.source_id,
    message
  }));
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

export { DEFAULT_REDACTION_PATTERNS };
