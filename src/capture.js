import { createHash } from "node:crypto";
import { CONTRACT_VERSION, CLASSIFICATION_METHOD_KEYWORD, REVIEW_STATUS_UNREVIEWED, assertCandidateClaim } from "./contracts.js";

export const PACKAGE_VERSION = "0.4.0";
export const CLASSIFICATION_METHOD = CLASSIFICATION_METHOD_KEYWORD;
export const REVIEW_STATUS = REVIEW_STATUS_UNREVIEWED;
export const EXPORT_PROFILES = Object.freeze(["repo-safe-summary", "internal-evidence-pack", "raw-local-only"]);
export const PORTABLE_PROFILES = Object.freeze(["repo-safe-summary", "internal-evidence-pack"]);
export const RAW_LOCAL_ONLY_PROFILE = "raw-local-only";
export const DEFAULT_REDACTION_PATTERNS = Object.freeze([
  [/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]"], [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi, "[REDACTED]"],
  [/\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, (m) => m.replace(/[^\s:=]+$/, "[REDACTED]")],
  [/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, "[REDACTED]"]
]);
const KIND_MAP = { status: "status", state: "status", health: "status", owner: "owner", dri: "owner", assignee: "owner", lead: "owner", target_date: "date", target: "date", due: "date", due_date: "date", start_date: "date", end_date: "date", deadline: "date", progress: "progress", progress_pct: "progress" };
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/;
const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;

export function createEvidencePack({ sources = [], now = () => new Date() } = {}) {
  const clock = validClock(now()); const diagnostics = []; const ids = new Set();
  const normalized = sources.map((input) => { const record = normalizeSourceRecord(input, { now: () => clock, diagnostics }); if (ids.has(record.id)) diagnostic(diagnostics, "duplicate_source_id", "warning", record.id, `Duplicate source id: ${record.id}.`); ids.add(record.id); return record; });
  const claims = []; const claimIds = new Set();
  sources.forEach((input, i) => { const extractionInput = { ...normalized[i], raw: input?.raw ?? input?.content ?? input?.body ?? input?.payload }; for (const claim of extractCandidateClaims(extractionInput, { now: () => clock })) { if (claimIds.has(claim.id)) diagnostic(diagnostics, "duplicate_candidate_id", "warning", claim.source_refs[0]?.source_id, `Duplicate candidate id: ${claim.id}.`); else { claimIds.add(claim.id); claims.push(claim); } } });
  return { kind: "capture_truth_evidence_pack", schema_version: CONTRACT_VERSION, generated_at: clock.toISOString(), sources: normalized, candidate_claims: claims, diagnostics, summary: { source_count: normalized.length, candidate_claim_count: claims.length, diagnostic_count: diagnostics.length, raw_included_count: normalized.filter((s) => s.raw_included).length } };
}
/** @deprecated Compatibility alias for createEvidencePack. */
export const captureSources = createEvidencePack;

export function normalizeSourceRecord(source, { now = () => new Date(), diagnostics = [] } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !source.id) throw new Error("capture source requires an object id.");
  const clock = validClock(now()); const id = String(source.id);
  const rawPresent = ["raw", "content", "body", "payload"].some((key) => source[key] !== undefined);
  const raw = source.raw ?? source.content ?? source.body ?? source.payload;
  const rawIncluded = source.raw_included === true && raw !== null && raw !== undefined;
  const observedInput = source.observed_at ?? source.captured_at ?? clock.toISOString();
  if (source.captured_at !== undefined) diagnostic(diagnostics, "deprecated_captured_at", "info", id, "captured_at is deprecated; observed_at is used.");
  const observed = normalizeTimestamp(observedInput); const updatedInput = source.source_updated_at ?? source.updated_at ?? source.metadata?.updated_at ?? null; const updated = updatedInput === null ? null : normalizeTimestamp(updatedInput);
  const observedValid = isValidTimestamp(observed); const updatedValid = updatedInput === null || isValidTimestamp(updated);
  if (!observedValid) diagnostic(diagnostics, "invalid_timestamp", "error", id, "observed_at is not a valid RFC3339 timestamp; capture clock was substituted.");
  if (updatedInput !== null && !updatedValid) diagnostic(diagnostics, "invalid_timestamp", "error", id, "source_updated_at is not a valid RFC3339 timestamp; value was omitted.");
  if (updatedInput === null) diagnostic(diagnostics, "missing_source_updated_at", "warning", id, "source_updated_at was not supplied.");
  const locator = source.locator ?? source.path ?? source.url ?? source.key ?? id;
  if (!source.locator) diagnostic(diagnostics, "missing_locator", "warning", id, "locator was not supplied; a stable fallback was used.");
  let hash = source.content_hash ?? `sha256:${hashContent(rawPresent ? raw : (source.fields ?? source.metadata ?? {}))}`;
  if (!HASH.test(String(hash))) { diagnostic(diagnostics, "invalid_content_hash", "error", id, "content_hash is invalid; a deterministic replacement was generated."); hash = `sha256:${hashContent(rawPresent ? raw : (source.fields ?? source.metadata ?? {}))}`; }
  if (source.raw_included !== true && rawPresent) diagnostic(diagnostics, "raw_body_excluded", "info", id, "raw body was excluded from the normalized record.");
  if (rawIncluded) diagnostic(diagnostics, "raw_local_only", "info", id, "raw body is retained only for an explicit local-only export.");
  const record = compact({ id, kind: source.kind ?? "record", type: source.type ?? "record", url: source.url ?? null, path: source.path ?? null, owner: source.owner ?? null, revision: source.revision ?? (typeof source.version === "object" ? source.version.number : source.version) ?? null, observed_at: observedValid ? observed : clock.toISOString(), source_updated_at: updatedValid ? updated : null, content_hash: hash, locator: String(locator), access_caveats: Array.isArray(source.access_caveats) ? source.access_caveats.map(String) : [], raw_included: rawIncluded, raw: rawIncluded ? raw : undefined, metadata: plainObject(source.metadata), fields: plainObject(source.fields) });
  Object.defineProperty(record, "__raw_supplied", { value: rawPresent, enumerable: false });
  return record;
}

export function extractCandidateClaims(source, { now = () => new Date() } = {}) {
  const record = source?.content_hash ? source : normalizeSourceRecord(source, { now }); const texts = [];
  const suppliedRaw = source?.raw ?? source?.content ?? source?.body ?? source?.payload;
  if (typeof suppliedRaw === "string") for (const line of suppliedRaw.split(/\r?\n/)) { const text = line.trim(); if (text && !text.startsWith("---") && !/^#{1,6}\s/.test(text) && !text.startsWith("<!--")) texts.push(text); }
  for (const [key, value] of Object.entries(record.fields ?? {})) if (typeof value === "string" && value.trim()) texts.push(`${key}: ${value}`);
  const seen = new Set(); return texts.filter((text) => { const key = text.trim().toLowerCase().replace(/\s+/g, " "); if (seen.has(key)) return false; seen.add(key); return true; }).map((text) => { const claim = compact({ id: `candidate-${digest(`${record.id}\0${text}`)}`, text, suggested_kind: classifySuggestedKind(text), classification_method: "keyword", review_status: "unreviewed", source_refs: [compact({ source_id: record.id, locator: record.locator, url: record.url, path: record.path, observed_at: isValidTimestamp(record.observed_at) ? record.observed_at : undefined, source_updated_at: isValidTimestamp(record.source_updated_at) ? record.source_updated_at : undefined, revision: record.revision, content_hash: HASH.test(String(record.content_hash)) ? record.content_hash : undefined })], extracted_at: new Date(now()).toISOString() }); assertCandidateClaim(claim); return claim; });
}
export function classifySuggestedKind(text) { const m = /^([a-z][a-z0-9_-]*)\s*:/i.exec(String(text).trim()); if (m && KIND_MAP[m[1].toLowerCase()]) return KIND_MAP[m[1].toLowerCase()]; if (/\b(blocked|blocker)\b/i.test(text)) return "blocker"; if (/\b(at risk|risk)\b/i.test(text)) return "risk"; if (/\bdecision\b/i.test(text)) return "decision"; if (/\b(action item|todo)\b/i.test(text)) return "action"; if (/\b(target date|due date|deadline)\b/i.test(text)) return "date"; return null; }

export function buildProfileExport(pack, profile, { portable = profile !== RAW_LOCAL_ONLY_PROFILE } = {}) {
  if (!EXPORT_PROFILES.includes(profile)) throw new Error(`Unsupported capture export profile: ${profile}`);
  if (profile === RAW_LOCAL_ONLY_PROFILE && portable) throw new Error("raw-local-only exports must stay local; refused portable output.");
  const portableProfile = profile !== RAW_LOCAL_ONLY_PROFILE; const redaction = { changed: false };
  const sourceById = new Map((pack.sources ?? []).map((s) => [s.id, s]));
  const sources = (pack.sources ?? []).map((s) => redactAllowlistedSource(s, redaction, !portableProfile));
  const claims = (pack.candidate_claims ?? []).filter((c) => !portableProfile || !(c.source_refs ?? []).some((r) => sourceById.get(r.source_id)?.__raw_supplied)).map((c) => redactAllowlistedClaim(c, redaction));
  const diagnostics = (pack.diagnostics ?? []).map((d) => redactDiagnostic(d, redaction));
  if (portableProfile && redaction.changed) diagnostics.push({ type: "redaction_applied", severity: "info", message: "Pattern redaction changed portable output." });
  return compact({ kind: "capture_truth_export", schema_version: CONTRACT_VERSION, profile, generated_at: pack.generated_at, portable: portableProfile, local_only: !portableProfile, sources: profile === "repo-safe-summary" ? undefined : sources, candidate_claims: claims, diagnostics, summary: { ...(pack.summary ?? {}), diagnostic_count: diagnostics.length } });
}
function redactAllowlistedSource(s, state, includeRaw) { return compact({ id: redact(s.id, state), type: redact(s.type, state), url: redact(s.url, state), path: redact(s.path, state), owner: redact(s.owner, state), revision: s.revision, observed_at: s.observed_at, source_updated_at: s.source_updated_at, content_hash: s.content_hash, locator: redact(s.locator, state), access_caveats: (s.access_caveats ?? []).map((v) => redact(v, state)), raw_included: s.raw_included, ...(includeRaw && s.raw_included === true && Object.hasOwn(s, "raw") ? { raw: s.raw } : {}), metadata: redactObject(s.metadata, state) }); }
function redactAllowlistedClaim(c, state) { return compact({ id: redact(c.id, state), text: redact(c.text, state), suggested_kind: redact(c.suggested_kind, state), classification_method: c.classification_method, review_status: c.review_status, source_refs: (c.source_refs ?? []).map((r) => compact({ source_id: redact(r.source_id, state), locator: redact(r.locator, state), note: redact(r.note, state), path: redact(r.path, state), url: redact(r.url, state), observed_at: r.observed_at, source_updated_at: r.source_updated_at, revision: r.revision, content_hash: r.content_hash, heading: redact(r.heading, state), tableRow: r.tableRow, line: r.line, text: redact(r.text, state) })) }); }
function redactDiagnostic(d, state) { return compact({ type: d.type, severity: d.severity, source_id: redact(d.source_id, state), message: redact(d.message, state) }); }
function redactObject(value, state) { if (Array.isArray(value)) return value.map((v) => redactObject(v, state)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => { if (sensitiveKey(k)) { state.changed = true; return ["[REDACTED_KEY]", "[REDACTED]"]; } return [redactKey(k, state), redactObject(v, state)]; })); return redact(value, state); }
function sensitiveKey(key) { return /(?:password|passwd|passphrase|secret|token|api[_-]?key|credential|private[_-]?key|access[_-]?key|auth(?:entication|orization)?|bearer|session[_-]?id|cookie)/i.test(String(key)); }
function redactKey(key, state) { if (sensitiveKey(key)) { state.changed = true; return "[REDACTED_KEY]"; } return redact(key, state); }
function redact(value, state) { if (typeof value !== "string") return value; const output = redactPatterns(value); if (output !== value) state.changed = true; return output; }
export function redactPatterns(value, patterns = DEFAULT_REDACTION_PATTERNS) { let text = String(value ?? ""); for (const [pattern, replacement] of patterns) text = text.replace(pattern, replacement); return text; }
export function hashContent(value) { return createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex"); }
export function canonicalLocator({ locator, path, url, key, id } = {}) { return [locator, path, url, key, id].find((v) => v !== undefined && v !== null && v !== "")?.toString() ?? "unknown"; }
export function normalizeTimestamp(value) { if (!isValidTimestamp(value)) return value; const m = RFC3339.exec(value.trim()); if (m[8].toUpperCase() === "Z") return `${value.trim().slice(0, -1).replace(/[tT]/, "T")}Z`; const [, y, mo, d, h, mi, s, f, zone, oh, om] = m; const ms = civil(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s), Math.floor(Number(`0.${f ?? "0"}`) * 1000)); return new Date(ms + (zone[0] === "+" ? -1 : 1) * (Number(oh) * 60 + Number(om)) * 60000).toISOString(); }
function isValidTimestamp(value) { if (typeof value !== "string") return false; const m = RFC3339.exec(value.trim()); if (!m) return false; const [, y, mo, d, h, mi, s, , zone, oh, om] = m; return Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= daysInMonth(Number(y), Number(mo)) && Number(h) < 24 && Number(mi) < 60 && Number(s) < 60 && (zone === "Z" || (Number(oh) < 24 && Number(om) < 60)); }
function validClock(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) throw new Error("Invalid capture clock."); return date; }
function daysInMonth(year, month) { const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0; return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]; }
function civil(y, m, d, h, mi, s, ms) { const a = y - (m <= 2); const era = Math.floor(a / 400), yoe = a - era * 400, mp = (m + 9) % 12, doy = Math.floor((153 * mp + 2) / 5) + d - 1, doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; return (era * 146097 + doe - 719468) * 86400000 + h * 3600000 + mi * 60000 + s * 1000 + ms; }
function diagnostic(list, type, severity, source_id, message) { list.push(compact({ type, severity, source_id, message })); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)); }
function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function stable(value) { if (!value || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`; }
function digest(value) { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
