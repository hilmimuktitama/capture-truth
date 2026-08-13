import { validateCanonicalCandidateClaim } from "./contracts.js";
import { candidateLine, normalizeCandidateText } from "./candidate-extraction.js";
import { rawLikeKey, sensitiveKey } from "./redaction.js";

export function validateCandidateDerivation(candidate, sourceById) {
  if (!candidate || !Array.isArray(candidate.source_refs) || candidate.source_refs.length === 0) {
    return { ok: false, message: "Candidate has no source reference." };
  }

  for (const reference of candidate.source_refs) {
    const source = sourceById.get(reference?.source_id);
    if (!source) {
      return { ok: false, message: `Candidate source reference is not present: ${reference?.source_id ?? "<missing>"}.` };
    }
    if (!sourceRefMatches(reference, source)) {
      return { ok: false, message: `Candidate source reference does not exactly match source ${source.id}.` };
    }

    const materials = candidateMaterials(source, candidate.text);
    const actualMaterial = materials.size === 1 ? [...materials][0] : materials.size > 1 ? "mixed" : null;
    if (actualMaterial !== candidate.source_material) {
      return { ok: false, message: `Candidate derivation does not match source ${source.id}.` };
    }
  }
  return { ok: true };
}

export function sourceRefMatches(reference, source) {
  if (String(reference?.source_id ?? "") !== String(source?.id ?? "")) return false;
  if (String(reference?.locator ?? "") !== String(source?.locator ?? "")) return false;

  for (const key of ["content_hash", "observed_at", "source_updated_at", "revision", "path", "url"]) {
    if ((reference[key] ?? null) !== (source[key] ?? null)) return false;
  }
  // These canonical SourceRef fields describe a more specific location than
  // Capture Truth can derive from a Source record. They are schema-valid
  // annotations, but do not participate in the source identity match.
  return true;
}

export function candidateMaterials(source, text) {
  const wanted = normalizeCandidateText(text);
  const materials = new Set();

  if (typeof source?.raw === "string") {
    const matchesRaw = source.raw
      .split(/\r?\n/)
      .some((line) => candidateLine(line) && normalizeCandidateText(line.trim()) === wanted);
    if (matchesRaw) materials.add("raw_body");
  }
  for (const [key, value] of Object.entries(source?.fields ?? {})) {
    if (!rawLikeKey(key) && typeof value === "string" && normalizeCandidateText(`${key}: ${value}`) === wanted) {
      materials.add("structured_fields");
    }
  }
  for (const [key, value] of Object.entries(source?.metadata ?? {})) {
    if (!sensitiveKey(key) && !rawLikeKey(key) && typeof value === "string" && normalizeCandidateText(`${key}: ${value}`) === wanted) {
      materials.add("metadata");
    }
  }
  return materials;
}

export function validateDerivationAndClaim(candidate, sourceById) {
  const validationErrors = validateCanonicalCandidateClaim(candidate);
  const derivation = validateCandidateDerivation(candidate, sourceById);
  return { validationErrors, derivation };
}
