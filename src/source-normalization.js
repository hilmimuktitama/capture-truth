import { createHash } from "node:crypto";
import { isValidTimestamp, normalizeTimestamp, validClock } from "./timestamp.js";
import { assertSafeUrlSchemes, findRawMaterialKey, findRawMaterialPaths, sanitizeStructured } from "./redaction.js";

const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;

export function normalizeSourceRecord(source, { now = () => new Date(), diagnostics = [] } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !source.id) {
    throw new Error("capture source requires an object id.");
  }
  assertSafeUrlSchemes(source);

  const clock = validClock(now());
  const id = String(source.id);
  const rawKey = findRawMaterialKey(source);
  const rawPresent = rawKey !== undefined;
  const raw = rawPresent ? source[rawKey] : undefined;
  const rawIncluded = source.raw_included === true && raw !== null && raw !== undefined;
  const rawPaths = findRawMaterialPaths(source);
  const observedInput = source.observed_at ?? source.captured_at ?? clock.toISOString();

  if (source.captured_at !== undefined) {
    diagnostic(diagnostics, "deprecated_captured_at", "info", id, "captured_at is deprecated; observed_at is used.");
  }

  const observed = normalizeTimestamp(observedInput);
  const updatedInput = source.source_updated_at
    ?? source.updated_at
    ?? source.metadata?.updated_at
    ?? null;
  const updated = updatedInput === null ? null : normalizeTimestamp(updatedInput);
  const observedValid = isValidTimestamp(observed);
  const updatedValid = updatedInput === null || isValidTimestamp(updated);

  if (!observedValid) {
    diagnostic(diagnostics, "invalid_timestamp", "error", id, "observed_at is not a valid RFC3339 timestamp; capture clock was substituted.");
  }
  if (updatedInput !== null && !updatedValid) {
    diagnostic(diagnostics, "invalid_timestamp", "error", id, "source_updated_at is not a valid RFC3339 timestamp; value was omitted.");
  }
  if (updatedInput === null) {
    diagnostic(diagnostics, "missing_source_updated_at", "warning", id, "source_updated_at was not supplied.");
  }

  const locator = canonicalLocator(source);
  if (!source.locator) {
    diagnostic(diagnostics, "missing_locator", "warning", id, "locator was not supplied; a stable fallback was used.");
  }

  let hash = source.content_hash ?? `sha256:${hashContent(rawPresent ? raw : (source.fields ?? source.metadata ?? {}))}`;
  if (!HASH.test(String(hash))) {
    diagnostic(diagnostics, "invalid_content_hash", "error", id, "content_hash is invalid; a deterministic replacement was generated.");
    hash = `sha256:${hashContent(rawPresent ? raw : (source.fields ?? source.metadata ?? {}))}`;
  }
  const retainedRawPath = rawIncluded ? `$.${rawKey}` : null;
  for (const path of rawPaths) {
    if (path !== retainedRawPath) {
      diagnostic(diagnostics, "raw_body_excluded", "info", id, `raw body was excluded from the normalized record at ${path}.`);
    }
  }
  if (rawIncluded) {
    diagnostic(diagnostics, "raw_local_only", "info", id, "raw body is retained only for an explicit local-only export.");
  }

  return compact({
    id,
    kind: source.kind ?? "record",
    type: source.type ?? "record",
    url: source.url ?? null,
    path: source.path ?? null,
    owner: source.owner ?? null,
    revision: source.revision ?? (typeof source.version === "object" ? source.version.number : source.version) ?? null,
    observed_at: observedValid ? observed : clock.toISOString(),
    source_updated_at: updatedValid ? updated : null,
    content_hash: hash,
    locator: String(locator),
    access_caveats: Array.isArray(source.access_caveats) ? source.access_caveats.map(String) : [],
    raw_included: rawIncluded,
    raw: rawIncluded ? raw : undefined,
    metadata: sanitizeStructured(plainObject(source.metadata)),
    fields: sanitizeStructured(plainObject(source.fields))
  });
}

export function canonicalLocator({ locator, path, url, key, id } = {}) {
  return [locator, path, url, key, id]
    .find((value) => value !== undefined && value !== null && value !== "")
    ?.toString() ?? "unknown";
}

export function hashContent(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stable(value))
    .digest("hex");
}

export function rawInput(source) {
  const key = findRawMaterialKey(source);
  return { raw: key === undefined ? undefined : source[key] };
}

export function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function diagnostic(list, type, severity, sourceId, message) {
  list.push(compact({ type, severity, source_id: sourceId, message }));
}

export function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

function stable(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
