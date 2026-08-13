export {
  CLASSIFICATION_METHOD,
  DEFAULT_REDACTION_PATTERNS,
  EXPORT_PROFILES,
  PORTABLE_PROFILES,
  RAW_LOCAL_ONLY_PROFILE,
  REVIEW_STATUS,
  buildProfileExport,
  buildCaptureOutput,
  createEvidencePack,
  canonicalLocator,
  captureSources,
  classifySuggestedKind,
  extractCandidateClaims,
  hashContent,
  normalizeSourceRecord,
  normalizeTimestamp,
  redactPatterns,
  reviewCandidateClaim,
  OUTPUT_MODES
} from "./capture.js";

export {
  CANDIDATE_CLAIM_SCHEMA,
  CONTRACT_VERSION,
  SOURCE_REF_SCHEMA,
  SOURCE_SCHEMA,
  assertCandidateClaim,
  assertCanonicalCandidateClaim,
  assertCanonicalSource,
  assertSourceRecord,
  assertSourceRef,
  assertEvidencePack,
  validateCandidateClaim,
  validateCanonicalCandidateClaim,
  validateCanonicalSource,
  validateSourceRecord,
  validateSourceRef,
  validateEvidencePack,
  validateProfileExport
} from "./contracts.js";

export {
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_REJECTED,
  REVIEW_STATUS_VALUES
} from "./contracts.js";

export {
  createConfluenceCompactAdapter,
  createFixtureAdapter,
  createJiraCompactAdapter,
  createLocalFileAdapter,
  normalizeConfluencePage,
  normalizeJiraIssue
} from "./adapters.js";
