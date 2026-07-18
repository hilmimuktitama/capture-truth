import { createHash } from "node:crypto";

const DEFAULT_ASSUMPTION = "No status, risk, timeline, or truth judgment was inferred.";
const REFINE_ASSUMPTION = "Refinement preserved source_refs unless explicitly replaced.";
const SCHEMA_VERSION = "0.3.0";
const PACK_VERSION = "0.3.0";
const FRESHNESS_VALUES = new Set(["fresh", "captured", "stale", "unknown", "fixture"]);
const MAX_SOURCES = 1000;
const MAX_SOURCE_BYTES = 5_000_000;
export const EXPORT_PROFILES = ["repo-safe-summary", "internal-evidence-pack", "raw-local-only"];

const SENSITIVE_PATTERNS = [
  { name: "authorization_header", pattern: /\bAuthorization\s*:\s*(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/i },
  { name: "secret_assignment", pattern: /\b(?:secret|token|password|api[_-]?key)\s*[:=]\s*\S+/i },
  { name: "cloud_access_key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "provider_token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,})\b/i },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { name: "customer_marker", pattern: /\b(?:customer|client)\s+(?:token|secret|credential|data)\b/i },
  { name: "email_address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i }
];

export function createEvidencePack({
  sources,
  adapters = [],
  extraction_profile = "general",
  now = () => new Date()
} = {}) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("create_evidence_pack requires at least one source.");
  }
  if (sources.length > MAX_SOURCES) {
    throw new Error(`create_evidence_pack accepts at most ${MAX_SOURCES} sources.`);
  }

  const normalizedSources = sources.map((source, index) => normalizeSource(source, index, adapters));
  const extractedAt = normalizeNow(now);
  const evidenceItems = normalizedSources.flatMap((source) => extractEvidenceItems(source));
  const claims = evidenceItems.flatMap((item) => evidenceItemToClaims(item, extraction_profile, extractedAt));
  const entities = extractEntities(claims);
  const gaps = detectGaps(normalizedSources, claims, { now: extractedAt, schemaVersion: SCHEMA_VERSION });
  const conflicts = detectConflicts(claims, normalizedSources);
  const assumptions = [DEFAULT_ASSUMPTION];
  const diagnostics = buildDiagnostics(normalizedSources, claims, gaps, conflicts);

  return {
    kind: "evidence_pack",
    schema_version: SCHEMA_VERSION,
    version: PACK_VERSION,
    created_at: extractedAt,
    extraction_profile,
    sources: normalizedSources,
    evidence_items: evidenceItems,
    claims,
    entities,
    gaps,
    conflicts,
    diagnostics,
    assumptions,
    exports: {
      repo_safe_summary: renderEvidencePack(
        {
          kind: "evidence_pack",
          sources: normalizedSources,
          claims,
          entities,
          gaps,
          conflicts,
          assumptions
        },
        { format: "markdown", export_profile: "repo-safe-summary" }
      ),
      generated_at: extractedAt
    }
  };
}

export function validateEvidencePack(evidencePack = {}, { now = () => new Date() } = {}) {
  if (evidencePack.kind !== "evidence_pack") {
    return {
      ok: false,
      gaps: [{ type: "invalid_kind", message: "Expected kind to be evidence_pack." }],
      conflicts: [],
      diagnostics: buildDiagnostics([], [], [{ type: "invalid_kind", message: "Expected kind to be evidence_pack." }], [])
    };
  }

  const sources = Array.isArray(evidencePack.sources) ? evidencePack.sources : [];
  const claims = Array.isArray(evidencePack.claims) ? evidencePack.claims : [];
  const gaps = detectGaps(sources, claims, { now: normalizeNow(now), schemaVersion: evidencePack.schema_version });
  const conflicts = detectConflicts(claims, sources);

  return {
    ok: gaps.length === 0 && conflicts.length === 0,
    gaps,
    conflicts,
    diagnostics: buildDiagnostics(sources, claims, gaps, conflicts),
    summary: {
      source_count: sources.length,
      claim_count: claims.length,
      gap_count: gaps.length,
      conflict_count: conflicts.length
    }
  };
}

export function renderEvidencePack(evidencePack = {}, { format = "markdown", export_profile } = {}) {
  if (export_profile) {
    return renderEvidencePackForProfile(evidencePack, { format, export_profile });
  }

  if (format === "json") {
    return JSON.stringify(evidencePack, null, 2);
  }
  if (format !== "markdown") {
    throw new Error(`Unsupported evidence pack render format: ${format}`);
  }

  const sources = evidencePack.sources ?? [];
  const claims = evidencePack.claims ?? [];
  const gaps = evidencePack.gaps ?? [];
  const conflicts = evidencePack.conflicts ?? [];
  const assumptions = evidencePack.assumptions ?? [];

  const lines = ["# Evidence Pack", ""];

  lines.push("## Sources");
  if (sources.length === 0) {
    lines.push("- No sources captured.");
  } else {
    for (const source of sources) {
      lines.push(
        `- ${source.id} (${source.type}, adapter: ${source.adapter}) - captured: ${
          source.captured_at ?? "unknown"
        }, freshness: ${source.freshness ?? "unknown"}`
      );
    }
  }

  lines.push("", "## Claims");
  if (claims.length === 0) {
    lines.push("- No claims extracted.");
  } else {
    for (const claim of claims) {
      const refs = claim.source_refs
        .map((ref) => `${ref.source_id}@${ref.locator}`)
        .join(", ");
      lines.push(`- [${claim.classification}] ${claim.text} (${refs})`);
    }
  }

  lines.push("", "## Gaps");
  if (gaps.length === 0) {
    lines.push("- No validation gaps detected.");
  } else {
    for (const gap of gaps) {
      lines.push(`- ${gap.type}: ${gap.message}`);
    }
  }

  lines.push("", "## Conflicts");
  if (conflicts.length === 0) {
    lines.push("- No unresolved conflicts detected.");
  } else {
    for (const conflict of conflicts) {
      if (conflict.claim && conflict.source_a && conflict.source_b) {
        lines.push(
          `- ${conflict.conflict_type}: ${conflict.claim} (${conflict.source_a.system}: ${conflict.source_a.value} vs ${conflict.source_b.system}: ${conflict.source_b.value})`
        );
      } else {
        lines.push(`- ${conflict.type ?? "source_conflict"}: ${(conflict.claim_ids ?? []).join(" vs ") || conflict.message || "Owner follow-up needed."}`);
      }
    }
  }

  lines.push("", "## Assumptions");
  for (const assumption of assumptions) {
    lines.push(`- ${assumption}`);
  }

  return `${lines.join("\n")}\n`;
}

export function refineEvidencePack(evidencePack = {}, { updates = [] } = {}) {
  if (!Array.isArray(updates)) {
    throw new Error("refine_evidence_pack requires updates to be an array.");
  }

  const claims = (evidencePack.claims ?? []).map((claim) => {
    const update = updates.find(
      (candidate) =>
        (candidate.matchId && candidate.matchId === claim.id) ||
        (candidate.matchText && candidate.matchText === claim.text)
    );
    if (!update) {
      return claim;
    }
    const next = {
      ...claim,
      ...(update.set ?? {})
    };
    if (!update.set || !Object.hasOwn(update.set, "source_refs")) {
      next.source_refs = claim.source_refs;
    }
    return next;
  });

  const nextPack = {
    ...evidencePack,
    claims,
    entities: extractEntities(claims),
    assumptions: unique([...(evidencePack.assumptions ?? []), REFINE_ASSUMPTION])
  };
  const gaps = detectGaps(nextPack.sources ?? [], claims, { schemaVersion: nextPack.schema_version });
  const conflicts = detectConflicts(claims, nextPack.sources ?? []);
  const complete = {
    ...nextPack,
    gaps,
    conflicts,
    diagnostics: buildDiagnostics(nextPack.sources ?? [], claims, gaps, conflicts)
  };
  return {
    ...complete,
    exports: {
      repo_safe_summary: renderEvidencePack(complete, {
        format: "markdown",
        export_profile: "repo-safe-summary"
      }),
      generated_at: complete.created_at
    }
  };
}

function normalizeSource(source, index, adapters) {
  if (!source || typeof source !== "object") {
    throw new Error(`Source at index ${index} must be an object.`);
  }
  if (!Object.hasOwn(source, "content")) {
    throw new Error(`Source at index ${index} is missing content.`);
  }

  const adapter = source.adapter ?? findAdapterType(source, adapters) ?? "direct";
  const id = source.id ?? source.key ?? source.path ?? source.url ?? `source-${index + 1}`;
  const rawContent = normalizeContent(source.content);
  if (Buffer.byteLength(rawContent, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error(`Source at index ${index} exceeds the ${MAX_SOURCE_BYTES}-byte limit.`);
  }

  return {
    id: String(id),
    type: source.type ?? inferSourceType(source),
    adapter,
    path: source.path ?? null,
    url: source.url ?? null,
    key: source.key ?? null,
    captured_at: source.captured_at ?? null,
    freshness: source.freshness ?? null,
    access_caveats: normalizeArray(source.access_caveats),
    metadata: source.metadata ?? {},
    content: rawContent,
    content_hash: hashContent(rawContent)
  };
}

function findAdapterType(source, adapters) {
  const adapter = adapters.find((candidate) => candidate.id && candidate.id === source.adapter_id);
  return adapter?.type ?? null;
}

function inferSourceType(source) {
  if (source.type) {
    return source.type;
  }
  const path = source.path ?? "";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".csv")) return "csv";
  if (path.endsWith(".json")) return "json";
  if (typeof source.content === "object") return "json";
  return "text";
}

function normalizeContent(content) {
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content, null, 2);
}

function extractEvidenceItems(source) {
  const rows = readSourceRows(source);

  return rows
    .map((row, index) => compactObject({
      id: `${slugify(source.id)}-item-${index + 1}`,
      text: row.text.trim(),
      structured: row.structured,
      source_ref: { source_id: source.id, locator: row.locator }
    }))
    .filter((item) => item.text.length > 0);
}

function evidenceItemToClaims(item, extractionProfile, extractedAt) {
  if (!isClaimCandidate(item)) return [];
  return splitAtomicStatements(item.text).map((text, index) => compactObject({
    id: `${item.id}-claim-${index + 1}`,
    text,
    classification: classifyClaim(text, extractionProfile),
    polarity: detectPolarity(text),
    structured: item.structured,
    source_refs: [{
      ...item.source_ref,
      locator: index === 0 ? item.source_ref.locator : `${item.source_ref.locator}#statement:${index + 1}`
    }],
    extracted_at: extractedAt
  }));
}

function isClaimCandidate(item) {
  const text = item.text.trim();
  if (/\b(?:Jira issue|Confluence page) compact intake$/i.test(text)) return false;
  if (/^(?:key|id|space|version|updated_at|url|assignee|parent):/i.test(text)) return false;
  if (!item.structured && !/[.:=!?]/.test(text) && text.split(/\s+/).length <= 4) return false;
  return true;
}

function splitAtomicStatements(text) {
  const value = String(text).trim();
  if (!value) return [];
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function readSourceRows(source) {
  if (source.type === "csv") {
    return readCsvRows(source.content);
  }
  if (source.type === "json") {
    return readJsonRows(source.content);
  }
  if (source.type === "markdown") {
    return readMarkdownRows(source.content);
  }
  return source.content
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), locator: `line:${index + 1}` }))
    .filter((row) => row.text);
}

function readCsvRows(content) {
  const records = parseCsvRecords(content);
  if (records.length === 0) return [];
  const headers = records[0].values.map((header) => header.trim());
  return records.slice(1).map((record) => {
    const values = record.values;
    const parts = headers.map((header, valueIndex) => `${header}: ${values[valueIndex] ?? ""}`);
    return { text: parts.join("; "), locator: `row:${record.startLine}` };
  });
}

function readMarkdownRows(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (isMarkdownTableLine(trimmed) && isMarkdownSeparatorLine(lines[index + 1]?.trim())) {
      const table = readMarkdownTable(lines, index);
      rows.push(...table.rows);
      index = table.endIndex;
      continue;
    }

    const text = trimmed.startsWith("#") ? "" : cleanMarkdownLine(lines[index]);
    if (text && !text.match(/^[-=]{3,}$/)) {
      rows.push({ text, locator: `line:${index + 1}` });
    }
  }

  return rows;
}

function readMarkdownTable(lines, startIndex) {
  const headers = splitMarkdownTableRow(lines[startIndex]).map((header) => header.trim());
  const rows = [];
  let index = startIndex + 2;

  while (index < lines.length && isMarkdownTableLine(lines[index].trim())) {
    const cells = splitMarkdownTableRow(lines[index]);
    const structured = markdownCellsToStructured(headers, cells);
    rows.push({
      text: structuredToClaimText(structured),
      locator: `row:${index + 1}`,
      structured
    });
    index += 1;
  }

  return { rows, endIndex: index - 1 };
}

function markdownCellsToStructured(headers, cells) {
  const structured = {};
  headers.forEach((header, index) => {
    const key = normalizeStructuredKey(header);
    const value = cells[index]?.trim();
    if (key && value) structured[key] = value;
  });
  return structured;
}

function structuredToClaimText(structured = {}) {
  const title = structured.title || structured.item || structured.task || structured.milestone || structured.name;
  const entries = Object.entries(structured).filter(([key]) => !["title", "item", "task", "milestone", "name"].includes(key));
  return [title, ...entries.map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join("; ");
}

function normalizeStructuredKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (["item", "task", "milestone", "name", "project", "title"].includes(key)) return "title";
  if (["target_date", "due", "date", "when"].includes(key)) return "target";
  return key;
}

function isMarkdownTableLine(line = "") {
  return /^\|.*\|\s*$/.test(line);
}

function isMarkdownSeparatorLine(line = "") {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function splitMarkdownTableRow(line = "") {
  return String(line)
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function readJsonRows(content) {
  const parsed = JSON.parse(content);
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.map((record, index) => ({
    text: objectToClaimText(record),
    locator: `json:${index + 1}`
  }));
}

function cleanMarkdownLine(line) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function objectToClaimText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${formatJsonValue(entry)}`)
    .join("; ");
}

function formatJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(formatJsonValue).join(", ");
  }
  if (value && typeof value === "object") {
    return objectToClaimText(value);
  }
  return String(value ?? "");
}

function parseCsvRecords(content) {
  const records = [];
  let values = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      values.push(field.trim());
      if (values.some((value) => value.length > 0)) records.push({ values, startLine });
      values = [];
      field = "";
      line += 1;
      startLine = line;
    } else {
      field += char;
      if (char === "\n") line += 1;
    }
  }
  values.push(field.trim());
  if (values.some((value) => value.length > 0)) records.push({ values, startLine });
  if (quoted) throw new Error("CSV source contains an unterminated quoted field.");
  return records;
}

function classifyClaim(text) {
  const lower = text.toLowerCase();
  if (/\b(blocked|blocker)\b/.test(lower) && detectPolarity(text) !== "negative") return "blocker";
  if (/\brisks?\b/.test(lower)) return "risk";
  if (/\bdecision\b/.test(lower)) return "decision";
  if (/\b(action|todo)\b/.test(lower)) return "action";
  return "observation";
}

function detectPolarity(text) {
  return /\b(?:not|never|no longer|isn't|aren't|wasn't|weren't)\b/i.test(text) ? "negative" : "positive";
}

function extractEntities(claims) {
  const text = claims.map((claim) => claim.text).join("\n");
  return {
    dates: unique(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []),
    tickets: unique(text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []),
    urls: unique(text.match(/https?:\/\/[^\s)]+/g) ?? []),
    owners: unique([...text.matchAll(/\bowner[:\s]+([A-Za-z][A-Za-z0-9_-]*(?:\s+[A-Za-z][A-Za-z0-9_-]*)?)/gi)].map((match) => match[1]))
  };
}

function detectGaps(sources, claims, { now = new Date().toISOString(), schemaVersion = SCHEMA_VERSION } = {}) {
  const gaps = [];
  const seen = new Set();
  const sourceIds = new Set(sources.map((source) => source.id));
  const claimIds = new Set();
  const nowMs = Date.parse(now);

  if (schemaVersion && schemaVersion !== SCHEMA_VERSION) {
    gaps.push({
      type: "unsupported_schema_version",
      message: `Expected schema_version '${SCHEMA_VERSION}', received '${schemaVersion}'.`
    });
  }

  for (const source of sources) {
    if (seen.has(source.id)) {
      gaps.push({
        type: "duplicate_source_id",
        source_id: source.id,
        message: `Source id '${source.id}' appears more than once.`
      });
    }
    seen.add(source.id);

    if (!source.id) {
      gaps.push({ type: "missing_source_identity", message: "A source is missing a stable id." });
    }
    if (!source.captured_at) {
      gaps.push({
        type: "missing_captured_at",
        source_id: source.id,
        message: `Source '${source.id}' is missing captured_at.`
      });
    } else if (!isIsoTimestamp(source.captured_at)) {
      gaps.push({
        type: "invalid_captured_at",
        source_id: source.id,
        message: `Source '${source.id}' has an invalid captured_at timestamp.`
      });
    } else if (Number.isFinite(nowMs) && Date.parse(source.captured_at) > nowMs + 5 * 60 * 1000) {
      gaps.push({
        type: "future_captured_at",
        source_id: source.id,
        message: `Source '${source.id}' has a captured_at timestamp in the future.`
      });
    }
    if (!source.freshness) {
      gaps.push({
        type: "missing_freshness",
        source_id: source.id,
        message: `Source '${source.id}' is missing freshness.`
      });
    } else if (!FRESHNESS_VALUES.has(source.freshness)) {
      gaps.push({
        type: "invalid_freshness",
        source_id: source.id,
        message: `Source '${source.id}' has unsupported freshness '${source.freshness}'.`
      });
    }
    if (source.freshness === "stale") {
      gaps.push({
        type: "stale_source",
        source_id: source.id,
        message: `Source '${source.id}' is marked stale.`
      });
    }
    for (const caveat of source.access_caveats ?? []) {
      gaps.push({
        type: "access_caveat",
        source_id: source.id,
        message: `Source '${source.id}' has access caveat: ${caveat}.`
      });
    }
  }

  for (const claim of claims) {
    if (!claim.id) {
      gaps.push({ type: "missing_claim_id", message: "A claim is missing a stable id." });
    } else if (claimIds.has(claim.id)) {
      gaps.push({ type: "duplicate_claim_id", claim_id: claim.id, message: `Claim id '${claim.id}' appears more than once.` });
    }
    claimIds.add(claim.id);
    if (typeof claim.text !== "string" || !claim.text.trim()) {
      gaps.push({ type: "missing_claim_text", claim_id: claim.id, message: `Claim '${claim.id ?? "<missing>"}' has no text.` });
    }
    if (!Array.isArray(claim.source_refs) || claim.source_refs.length === 0) {
      gaps.push({
        type: "missing_source_refs",
        claim_id: claim.id,
        message: `Claim '${claim.id}' is missing source_refs.`
      });
      continue;
    }
    for (const ref of claim.source_refs) {
      const sourceId = ref.source_id ?? ref.sourceId;
      if (!sourceId || !sourceIds.has(sourceId)) {
        gaps.push({
          type: "dangling_source_ref",
          claim_id: claim.id,
          source_id: sourceId,
          message: `Claim '${claim.id}' references an unknown source '${sourceId ?? "<missing>"}'.`
        });
      }
      if (!ref.locator) {
        gaps.push({
          type: "missing_source_locator",
          claim_id: claim.id,
          source_id: sourceId,
          message: `Claim '${claim.id}' has a source ref without a locator.`
        });
      }
    }
  }

  return gaps;
}

function buildDiagnostics(sources, claims, gaps, conflicts) {
  const qualityIssues = sourceQualityIssues(sources, claims, gaps);
  return {
    sources: sources.map((source) => ({
      id: source.id,
      type: source.type,
      adapter: source.adapter,
      freshness: source.freshness ?? "unknown",
      parsed_claims: claims.filter((claim) =>
        (claim.source_refs ?? []).some((ref) => ref.source_id === source.id || ref.sourceId === source.id)
      ).length
    })),
    source_quality: {
      ok: qualityIssues.length === 0,
      issues: qualityIssues
    },
    summary: {
      source_count: sources.length,
      claim_count: claims.length,
      gap_count: gaps.length,
      conflict_count: conflicts.length
    }
  };
}

function sourceQualityIssues(sources, claims, gaps) {
  const gapIssueTypes = new Set([
    "duplicate_source_id",
    "missing_source_identity",
    "missing_captured_at",
    "missing_freshness",
    "stale_source",
    "access_caveat",
    "missing_source_refs",
    "invalid_captured_at",
    "future_captured_at",
    "invalid_freshness",
    "missing_claim_id",
    "duplicate_claim_id",
    "missing_claim_text",
    "dangling_source_ref",
    "missing_source_locator",
    "unsupported_schema_version"
  ]);
  const issues = gaps
    .filter((gap) => gapIssueTypes.has(gap.type))
    .map((gap) =>
      compactObject({
        type: gap.type,
        source_id: gap.source_id,
        claim_id: gap.claim_id,
        message: gap.message
      })
    );

  for (const source of sources) {
    const parsedClaims = claims.filter((claim) =>
      (claim.source_refs ?? []).some((ref) => ref.source_id === source.id || ref.sourceId === source.id)
    ).length;
    if (parsedClaims === 0) {
      issues.push({
        type: "no_claims_extracted",
        source_id: source.id,
        message: `Source '${source.id}' produced no claims.`
      });
    }
  }

  return dedupeIssues(issues);
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = [issue.type, issue.source_id, issue.claim_id, issue.message].map((value) => String(value ?? "")).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkRedaction(value) {
  const text = JSON.stringify(value ?? {});
  const blockedTerms = [];

  for (const item of SENSITIVE_PATTERNS) {
    if (item.pattern.test(text)) {
      blockedTerms.push(item.name);
    }
  }

  return {
    ok: blockedTerms.length === 0,
    blocked_terms: blockedTerms
  };
}

function renderEvidencePackForProfile(evidencePack, { format, export_profile }) {
  if (!EXPORT_PROFILES.includes(export_profile)) {
    throw new Error(`Unsupported evidence pack export profile: ${export_profile}`);
  }

  if (export_profile === "raw-local-only") {
    return renderEvidencePack(evidencePack, { format });
  }

  if (export_profile === "internal-evidence-pack") {
    const redacted = sanitizeEvidencePack(evidencePack, { includeClaims: true });
    return format === "json" ? JSON.stringify(redacted, null, 2) : renderRepoSafeSummary(redacted, export_profile);
  }

  if (format === "json") {
    return JSON.stringify(sanitizeEvidencePack(evidencePack, { includeClaims: false }), null, 2);
  }
  return renderRepoSafeSummary(evidencePack, export_profile);
}

function renderRepoSafeSummary(evidencePack = {}, exportProfile) {
  const sources = evidencePack.sources ?? [];
  const claims = evidencePack.claims ?? [];
  const gaps = evidencePack.gaps ?? [];
  const conflicts = evidencePack.conflicts ?? [];
  const assumptions = evidencePack.assumptions ?? [];
  const redaction = checkRedaction(evidencePack);
  const lines = ["# Evidence Pack", "", `Export profile: ${exportProfile}`, ""];

  lines.push("## Summary");
  lines.push(`- Sources: ${sources.length}`);
  lines.push(`- Claims: ${claims.length}`);
  lines.push(`- Gaps: ${gaps.length}`);
  lines.push(`- Conflicts: ${conflicts.length}`);

  lines.push("", "## Sources");
  if (sources.length === 0) {
    lines.push("- No sources captured.");
  } else {
    for (const source of sources) {
      lines.push(
        `- ${sanitizeForExport(source.id)} (${sanitizeForExport(source.type ?? "unknown")}, adapter: ${sanitizeForExport(source.adapter ?? "unknown")}) - captured: ${
          sanitizeForExport(source.captured_at ?? "unknown")
        }, freshness: ${source.freshness ?? "unknown"}`
      );
    }
  }

  lines.push("", "## Gaps");
  if (gaps.length === 0) {
    lines.push("- No validation gaps detected.");
  } else {
    for (const gap of gaps) {
      lines.push(`- ${sanitizeForExport(gap.type)}: ${sanitizeForExport(gap.message)}`);
    }
  }

  lines.push("", "## Conflicts");
  if (conflicts.length === 0) {
    lines.push("- No unresolved conflicts detected.");
  } else {
    for (const conflict of conflicts) {
      if (conflict.source_a && conflict.source_b) {
        lines.push(`- ${sanitizeForExport(conflict.conflict_type ?? conflict.type)}: ${sanitizeForExport(conflict.claim ?? "Unspecified conflict")}`);
        lines.push(`  - ${renderRepoSafeConflictSource(conflict.source_a)}`);
        lines.push(`  - ${renderRepoSafeConflictSource(conflict.source_b)}`);
        lines.push(`  - Action: ${conflict.recommended_owner_action ?? "Owner follow-up needed."}`);
      } else {
        lines.push(
          `- ${sanitizeForExport(conflict.conflict_type ?? conflict.type)}: ${sanitizeForExport(conflict.claim ?? "Unspecified conflict")} - ${sanitizeForExport(conflict.recommended_owner_action ?? "Owner follow-up needed.")}`
        );
      }
    }
  }

  if (assumptions.length > 0) {
    lines.push("", "## Assumptions");
    for (const assumption of assumptions) {
      lines.push(`- ${sanitizeForExport(assumption)}`);
    }
  }

  if (!redaction.ok) {
    lines.push("", "## Redaction warnings");
    for (const term of redaction.blocked_terms) {
      lines.push(`- ${term} detected in source material and omitted from this export.`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderRepoSafeConflictSource(source = {}) {
  const system = sanitizeForExport(source.system ?? "unknown");
  const value = renderRepoSafeConflictValue(source.value);
  const capturedAt = source.captured_at ?? "unknown";
  const freshness = source.freshness ?? "unknown";

  return `${system}: ${value}, captured: ${capturedAt}, freshness: ${freshness}`;
}

function renderRepoSafeConflictValue(value) {
  const text = value === null || value === undefined ? "unknown" : String(value);
  return checkRedaction(text).ok ? text : "[redacted]";
}

function sanitizeEvidencePack(evidencePack, { includeClaims }) {
  const sanitized = sanitizeValue(evidencePack, new Set(["content", "exports"]));
  sanitized.sources = (sanitized.sources ?? []).map((source) => ({ ...source, content_redacted: true }));
  if (!includeClaims) {
    delete sanitized.claims;
    delete sanitized.evidence_items;
    delete sanitized.entities;
  }
  return sanitized;
}

function sanitizeValue(value, omittedKeys = new Set()) {
  if (typeof value === "string") return sanitizeForExport(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, omittedKeys));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !omittedKeys.has(key))
      .map(([key, entry]) => [key, sanitizeValue(entry, omittedKeys)])
  );
}

function sanitizeForExport(value) {
  const text = String(value);
  return checkRedaction(text).ok ? text.replace(/[\r\n]+/g, " ") : "[redacted]";
}

function detectConflicts(claims, sources = []) {
  const conflicts = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const dateClaims = new Map();
  const polarityClaims = new Map();

  for (const claim of claims) {
    for (const ticket of extractTickets(claim.text)) {
      const date = extractDates(claim.text)[0];
      if (!date) continue;
      const key = `${ticket}|${datePredicateSignature(claim.text)}`;
      const previous = dateClaims.get(key);
      if (previous && previous.date !== date) {
        conflicts.push(makeConflict({
          claim: `${ticket} date`,
          sourceA: sourceRefToConflictSource(previous.claim, sourceById, previous.date),
          sourceB: sourceRefToConflictSource(claim, sourceById, date),
          conflictType: "date_mismatch"
        }));
      } else if (!previous) {
        dateClaims.set(key, { claim, date });
      }
    }

    const normalized = normalizeConflictText(claim.text);
    const key = stripNegation(normalized);
    const polarity = detectPolarity(claim.text);
    const previous = polarityClaims.get(key);
    if (previous && previous.polarity !== polarity && normalized !== previous.normalized) {
      conflicts.push(makeConflict({
        claim: describeNegationClaim(previous.claim.text, claim.text),
        sourceA: sourceRefToConflictSource(previous.claim, sourceById),
        sourceB: sourceRefToConflictSource(claim, sourceById),
        conflictType: "claim_disagreement"
      }));
    } else if (!previous) {
      polarityClaims.set(key, { claim, polarity, normalized });
    }
  }

  return dedupeConflicts(conflicts);
}

function datePredicateSignature(text) {
  return normalizeConflictText(text)
    .replace(/^(?:summary|title):?\s+/, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<date>")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeConflicts(conflicts) {
  const seen = new Set();
  return conflicts.filter((conflict) => {
    const key = [
      conflict.conflict_type,
      conflict.claim,
      conflict.source_a?.system,
      conflict.source_a?.value,
      conflict.source_b?.system,
      conflict.source_b?.value
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeConflict({ claim, sourceA, sourceB, conflictType }) {
  return {
    claim,
    source_a: sourceA,
    source_b: sourceB,
    conflict_type: conflictType,
    recommended_owner_action:
      "Assign an owner to reconcile the source disagreement and update the system of record."
  };
}

function sourceRefToConflictSource(claim, sourceById, value = claim.text) {
  const sourceId = claim.source_refs?.[0]?.source_id ?? claim.source_refs?.[0]?.sourceId ?? "unknown";
  const source = sourceById.get(sourceId) ?? {};
  return compactObject({
    system: sourceId,
    value,
    captured_at: source.captured_at ?? undefined,
    freshness: source.freshness ?? undefined
  });
}

function extractTickets(text) {
  return unique(String(text).match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []);
}

function extractDates(text) {
  return unique(String(text).match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []);
}

function describeNegationClaim(leftText, rightText) {
  const text = String(leftText || rightText);
  const blockedBy = text.match(/^(.+?)\s+is\s+(?:not\s+)?blocked by\s+(.+?)\.?$/i);
  if (blockedBy) {
    return `${capitalize(blockedBy[1])} ${blockedBy[2].replace(/\.$/, "")} blocker`;
  }
  return stripNegation(normalizeConflictText(text));
}

function normalizeConflictText(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
}

function stripNegation(text) {
  return text
    .replace(/\bis not\b/g, "is")
    .replace(/\bare not\b/g, "are")
    .replace(/\bwas not\b/g, "was")
    .replace(/\bwere not\b/g, "were")
    .replace(/\bnot blocked\b/g, "blocked")
    .replace(/\bno longer blocked\b/g, "blocked")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "source";
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function capitalize(value) {
  const text = String(value).trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function hashContent(content) {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function normalizeNow(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("now must produce a valid date.");
  return date.toISOString();
}
