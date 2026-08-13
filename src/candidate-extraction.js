import { createHash } from "node:crypto";
import {
  assertCandidateClaim,
  CLASSIFICATION_METHOD_KEYWORD,
  DERIVATION_VERSION,
  SOURCE_MATERIAL_VALUES,
  REVIEW_STATUS_UNREVIEWED
} from "./contracts.js";
import { compact, normalizeSourceRecord, rawInput } from "./source-normalization.js";
import { isValidTimestamp, validClock } from "./timestamp.js";
import { rawLikeKey, sensitiveKey } from "./redaction.js";

const KIND_MAP = {
  status: "status",
  state: "status",
  health: "status",
  owner: "owner",
  dri: "owner",
  assignee: "owner",
  lead: "owner",
  target_date: "date",
  target: "date",
  due: "date",
  due_date: "date",
  start_date: "date",
  end_date: "date",
  deadline: "date",
  progress: "progress",
  progress_pct: "progress"
};

export function extractCandidateClaims(source, { now = () => new Date() } = {}) {
  const record = source?.content_hash
    ? source
    : normalizeSourceRecord(source, { now });
  const texts = collectCandidateTexts(record, source);
  const unique = mergeDuplicateTexts(texts);
  const extractedAt = validClock(now()).toISOString();

  return unique.map(({ text, materials }) => {
    const sourceMaterial = materials.size === 1 ? [...materials][0] : "mixed";
    if (!SOURCE_MATERIAL_VALUES.includes(sourceMaterial)) {
      throw new Error(`Unsupported candidate source material: ${sourceMaterial}`);
    }

    const claim = compact({
      id: `candidate-${digest(`${record.id}\0${text}`)}`,
      text,
      suggested_kind: classifySuggestedKind(text),
      classification_method: CLASSIFICATION_METHOD_KEYWORD,
      review_status: REVIEW_STATUS_UNREVIEWED,
      source_refs: [compact({
        source_id: record.id,
        locator: record.locator,
        url: record.url,
        path: record.path,
        observed_at: isValidTimestamp(record.observed_at) ? record.observed_at : undefined,
        source_updated_at: isValidTimestamp(record.source_updated_at) ? record.source_updated_at : undefined,
        revision: record.revision,
        content_hash: isValidHash(record.content_hash) ? record.content_hash : undefined
      })],
      extracted_at: extractedAt,
      derivation_version: DERIVATION_VERSION,
      source_material: sourceMaterial
    });
    assertCandidateClaim(claim);
    return claim;
  });
}

export function classifySuggestedKind(text) {
  const match = /^([a-z][a-z0-9_-]*)\s*:/i.exec(String(text).trim());
  if (match && KIND_MAP[match[1].toLowerCase()]) return KIND_MAP[match[1].toLowerCase()];
  if (/\b(blocked|blocker)\b/i.test(text)) return "blocker";
  if (/\b(at risk|risk)\b/i.test(text)) return "risk";
  if (/\bdecision\b/i.test(text)) return "decision";
  if (/\b(action item|todo)\b/i.test(text)) return "action";
  if (/\b(target date|due date|deadline)\b/i.test(text)) return "date";
  return null;
}

export function candidateLine(line) {
  const text = line.trim();
  return text && !text.startsWith("---") && !/^#{1,6}\s/.test(text) && !text.startsWith("<!--");
}

export function normalizeCandidateText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function collectCandidateTexts(record, source) {
  const texts = [];
  const suppliedRaw = rawInput(source).raw;
  if (typeof suppliedRaw === "string") {
    for (const line of suppliedRaw.split(/\r?\n/)) {
      const text = line.trim();
      if (candidateLine(line)) texts.push({ text, material: "raw_body" });
    }
  }

  for (const [key, value] of Object.entries(record.fields ?? {})) {
    if (!rawLikeKey(key) && typeof value === "string" && value.trim()) {
      texts.push({ text: `${key}: ${value}`, material: "structured_fields" });
    }
  }
  for (const [key, value] of Object.entries(record.metadata ?? {})) {
    if (!sensitiveKey(key) && !rawLikeKey(key) && typeof value === "string" && value.trim()) {
      texts.push({ text: `${key}: ${value}`, material: "metadata" });
    }
  }
  return texts;
}

function mergeDuplicateTexts(texts) {
  const seen = new Map();
  for (const entry of texts) {
    const key = normalizeCandidateText(entry.text);
    const prior = seen.get(key);
    if (prior) prior.materials.add(entry.material);
    else seen.set(key, { text: entry.text, materials: new Set([entry.material]) });
  }
  return [...seen.values()];
}

function isValidHash(value) {
  return /^(?:sha256:)?[a-f0-9]{64}$/.test(String(value));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
