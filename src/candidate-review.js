import {
  assertCandidateClaim,
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_REJECTED,
  validateCanonicalCandidateClaim,
  validateSourceRecord,
  validateEvidencePack
} from "./contracts.js";
import { isValidTimestamp } from "./timestamp.js";
import { validateCandidateDerivation } from "./derivation-validation.js";

export function reviewCandidateClaim(pack, { candidateId, decision, reviewedBy, reviewedAt } = {}) {
  if (!pack || typeof pack !== "object" || !Array.isArray(pack.candidate_claims)) {
    throw new Error("review requires an evidence pack.");
  }
  if (typeof candidateId !== "string" || !candidateId) {
    throw new Error("candidateId must be a non-empty string.");
  }
  if (!["approve-portable", "reject"].includes(decision)) {
    throw new Error("decision must be approve-portable or reject.");
  }
  if (typeof reviewedBy !== "string" || !reviewedBy.trim()) {
    throw new Error("reviewedBy must be a non-empty string.");
  }
  if (!isValidTimestamp(reviewedAt)) {
    throw new Error("reviewedAt must be a valid RFC3339 timestamp.");
  }

  const matchingSources = Array.isArray(pack.sources) ? pack.sources : [];
  const sourceIds = new Set(matchingSources.map((source) => String(source.id)));
  if (sourceIds.size !== matchingSources.length || matchingSources.some((source) => typeof source?.id !== "string" || !source.id)) throw new Error("Cannot review a pack with duplicate or missing source ids.");
  const sourceById = new Map(matchingSources.map((source) => [String(source.id), source]));
  if (validateEvidencePack(pack).length) throw new Error("Cannot review an invalid evidence pack.");
  for (const source of matchingSources) {
    if (validateSourceRecord(source).length) throw new Error(`Cannot review a pack containing invalid source ${source.id}.`);
  }
  const candidateIds = new Set();
  for (const entry of pack.candidate_claims) {
    if (!entry || candidateIds.has(entry.id)) throw new Error("Cannot review a pack with duplicate or missing candidate ids.");
    candidateIds.add(entry.id);
    if (validateCanonicalCandidateClaim(entry).length) throw new Error("Cannot review a pack containing an invalid candidate claim.");
    const entryDerivation = validateCandidateDerivation(entry, sourceById);
    if (!entryDerivation.ok) throw new Error(`Cannot review a pack with forged candidate derivation: ${entryDerivation.message}`);
  }
  const index = pack.candidate_claims.findIndex((candidate) => candidate?.id === candidateId);
  if (index < 0) throw new Error(`Unknown candidate id: ${candidateId}.`);

  const candidate = pack.candidate_claims[index];
  if (validateCanonicalCandidateClaim(candidate).length) {
    throw new Error("Cannot review an invalid candidate claim.");
  }
  const derivation = validateCandidateDerivation(candidate, sourceById);
  if (!derivation.ok) throw new Error(`Cannot review a forged candidate derivation: ${derivation.message}`);
  if (decision === "approve-portable" && ["raw_body", "mixed"].includes(candidate.source_material)) {
    throw new Error(`Cannot approve-portable a ${candidate.source_material} candidate.`);
  }

  const reviewed = structuredClone(pack);
  reviewed.candidate_claims[index] = {
    ...structuredClone(candidate),
    review_status: decision === "approve-portable" ? REVIEW_STATUS_APPROVED : REVIEW_STATUS_REJECTED,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt
  };
  assertCandidateClaim(reviewed.candidate_claims[index]);
  return reviewed;
}
