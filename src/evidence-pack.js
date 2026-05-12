const DEFAULT_ASSUMPTION = "No status, risk, timeline, or truth judgment was inferred.";
const REFINE_ASSUMPTION = "Refinement preserved source_refs unless explicitly replaced.";

export function createEvidencePack({ sources, adapters = [], extraction_profile = "general" } = {}) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("create_evidence_pack requires at least one source.");
  }

  const normalizedSources = sources.map((source, index) => normalizeSource(source, index, adapters));
  const claims = normalizedSources.flatMap((source) => extractClaims(source, extraction_profile));
  const entities = extractEntities(claims);
  const gaps = detectGaps(normalizedSources, claims);
  const conflicts = detectConflicts(claims);
  const assumptions = [DEFAULT_ASSUMPTION];

  return {
    kind: "evidence_pack",
    version: "0.1.0",
    created_at: new Date().toISOString(),
    extraction_profile,
    sources: normalizedSources,
    claims,
    entities,
    gaps,
    conflicts,
    assumptions,
    exports: {
      markdown: renderEvidencePack(
        {
          kind: "evidence_pack",
          sources: normalizedSources,
          claims,
          entities,
          gaps,
          conflicts,
          assumptions
        },
        { format: "markdown" }
      )
    }
  };
}

export function validateEvidencePack(evidencePack = {}) {
  if (evidencePack.kind !== "evidence_pack") {
    return {
      ok: false,
      gaps: [{ type: "invalid_kind", message: "Expected kind to be evidence_pack." }],
      conflicts: []
    };
  }

  const sources = Array.isArray(evidencePack.sources) ? evidencePack.sources : [];
  const claims = Array.isArray(evidencePack.claims) ? evidencePack.claims : [];
  const gaps = detectGaps(sources, claims);
  const conflicts = detectConflicts(claims);

  return {
    ok: gaps.length === 0 && conflicts.length === 0,
    gaps,
    conflicts,
    summary: {
      source_count: sources.length,
      claim_count: claims.length,
      gap_count: gaps.length,
      conflict_count: conflicts.length
    }
  };
}

export function renderEvidencePack(evidencePack = {}, { format = "markdown" } = {}) {
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
      lines.push(`- ${conflict.type}: ${conflict.claim_ids.join(" vs ")}`);
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
    assumptions: unique([...(evidencePack.assumptions ?? []), REFINE_ASSUMPTION])
  };

  return {
    ...nextPack,
    gaps: detectGaps(nextPack.sources ?? [], claims),
    conflicts: detectConflicts(claims),
    exports: {
      ...(evidencePack.exports ?? {}),
      markdown: renderEvidencePack(nextPack, { format: "markdown" })
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

function extractClaims(source, extractionProfile) {
  const rows = readSourceRows(source);

  return rows
    .map((row, index) => rowToClaim(row, source, index, extractionProfile))
    .filter((claim) => claim.text.length > 0);
}

function readSourceRows(source) {
  if (source.type === "csv") {
    return readCsvRows(source.content);
  }
  if (source.type === "json") {
    return readJsonRows(source.content);
  }
  if (source.type === "markdown") {
    return source.content
      .split(/\r?\n/)
      .map((line, index) => ({
        text: line.trim().startsWith("#") ? "" : cleanMarkdownLine(line),
        locator: `line:${index + 1}`
      }))
      .filter((row) => row.text && !row.text.match(/^[-=]{3,}$/));
  }
  return source.content
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), locator: `line:${index + 1}` }))
    .filter((row) => row.text);
}

function readCsvRows(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const parts = headers.map((header, valueIndex) => `${header}: ${values[valueIndex] ?? ""}`);
    return { text: parts.join("; "), locator: `row:${index + 2}` };
  });
}

function readJsonRows(content) {
  const parsed = JSON.parse(content);
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.map((record, index) => ({
    text: objectToClaimText(record),
    locator: `json:${index + 1}`
  }));
}

function rowToClaim(row, source, index, extractionProfile) {
  const text = row.text.trim();
  return {
    id: `${slugify(source.id)}-claim-${index + 1}`,
    text,
    classification: classifyClaim(text, extractionProfile),
    source_refs: [{ source_id: source.id, locator: row.locator }],
    extracted_at: new Date().toISOString()
  };
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

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function classifyClaim(text) {
  const lower = text.toLowerCase();
  if (lower.includes("blocked") || lower.includes("blocker")) return "blocker";
  if (lower.includes("risk")) return "risk";
  if (lower.includes("decision")) return "decision";
  if (lower.includes("action") || lower.includes("todo")) return "action";
  return "observation";
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

function detectGaps(sources, claims) {
  const gaps = [];
  const seen = new Set();

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
    }
    if (!source.freshness) {
      gaps.push({
        type: "missing_freshness",
        source_id: source.id,
        message: `Source '${source.id}' is missing freshness.`
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
    if (!Array.isArray(claim.source_refs) || claim.source_refs.length === 0) {
      gaps.push({
        type: "missing_source_refs",
        claim_id: claim.id,
        message: `Claim '${claim.id}' is missing source_refs.`
      });
    }
  }

  return gaps;
}

function detectConflicts(claims) {
  const conflicts = [];

  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const left = claims[leftIndex];
      const right = claims[rightIndex];
      if (isNegatedPair(left.text, right.text)) {
        conflicts.push({
          type: "unresolved_negation",
          claim_ids: [left.id, right.id],
          message: "Claims appear to contradict each other and were not resolved."
        });
      }
    }
  }

  return conflicts;
}

function isNegatedPair(leftText, rightText) {
  const left = normalizeConflictText(leftText);
  const right = normalizeConflictText(rightText);
  if (left === right) return false;

  const leftStripped = stripNegation(left);
  const rightStripped = stripNegation(right);
  return leftStripped === rightStripped && left !== right;
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

function hashContent(content) {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash << 5) - hash + content.charCodeAt(index);
    hash |= 0;
  }
  return `h${Math.abs(hash).toString(16)}`;
}
