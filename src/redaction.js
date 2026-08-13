const CREDENTIAL_KEY_PATTERN = String.raw`(?:password|passwd|passphrase|secret|api[_-]?key|x-api-key|token|credential|credentials|private[_-]?key|access[_-]?key|auth(?:orization|entication)?|bearer|cookie|session(?:[_-]?(?:id|token|key))?|signature|sig)`;

export const DEFAULT_REDACTION_PATTERNS = Object.freeze([
  [/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]"],
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[REDACTED]"],
  [/\b(?:Authorization|Cookie)\s*:\s*(?:(?:Bearer|Basic)\s+)?[^\s,;]+(?:\s*;[^\s,;=]+=[^\s,;]+)*/gi, redactCredentialValue],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{1,}\b/gi, "[REDACTED]"],
  [new RegExp(`\\b${CREDENTIAL_KEY_PATTERN}\\s*[:=]\\s*(?:(?:Bearer|Basic)\\s+)?[^\\s,;]+`, "gi"), redactCredentialValue],
  [new RegExp(`\\b${CREDENTIAL_KEY_PATTERN}\\s+[A-Za-z0-9._~+/=-]{1,}\\b`, "gi"), "[REDACTED]"],
  [/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, "[REDACTED]"]
]);

export function redactPatterns(value, patterns = DEFAULT_REDACTION_PATTERNS) {
  let text = String(value ?? "");
  for (const [pattern, replacement] of patterns) text = text.replace(pattern, replacement);
  return text;
}

export function sanitizeCredentialUrls(value) {
  if (Array.isArray(value)) return value.map(sanitizeCredentialUrls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeCredentialUrls(entry)]));
  }
  if (typeof value !== "string") return value;

  const encoded = value.replace(
    /(?:https?|ftp)%3a%2f%2f[^\s<>"'`]+/gi,
    sanitizeEncodedUrl
  );
  return encoded.replace(
    /(?:[a-z][a-z\d+.-]*:)?\/\/[^\s<>"'`]+/gi,
    sanitizeStandaloneUrl
  );
}

export function assertSafeUrlSchemes(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeUrlSchemes(entry, `${path}[${index}]`));
    return value;
  }
  if (!value || typeof value !== "object") return value;
  for (const [key, entry] of Object.entries(value)) {
    if (["url", "locator", "path"].includes(key.toLowerCase()) && typeof entry === "string" && unsafeScheme(entry, key)) {
      throw new Error(`${path}.${key}: unsafe URL scheme is not allowed`);
    }
    assertSafeUrlSchemes(entry, `${path}.${key}`);
  }
  return value;
}

export function redactAllowlistedSource(source, state, includeRaw, sanitizeUrls) {
  if (!sanitizeUrls && includeRaw) return structuredClone(source);

  return compact({
    id: redact(source.id, state),
    kind: redact(source.kind, state),
    type: redact(source.type, state),
    adapter: redact(source.adapter, state),
    key: redact(source.key, state),
    url: sanitizeUrls ? redactUrl(source.url, state) : redact(source.url, state),
    path: sanitizeUrls ? redactUrl(source.path, state) : redact(source.path, state),
    owner: redact(source.owner, state),
    revision: source.revision,
    observed_at: source.observed_at,
    source_updated_at: source.source_updated_at,
    content_hash: source.content_hash,
    locator: sanitizeUrls ? redactUrl(source.locator, state) : redact(source.locator, state),
    access_caveats: (source.access_caveats ?? []).map((value) => (
      sanitizeUrls ? redactUrl(value, state) : redact(value, state)
    )),
    raw_included: includeRaw ? source.raw_included : undefined,
    fields: redactObject(sanitizeStructured(source.fields), state, sanitizeUrls),
    metadata: redactObject(sanitizeStructured(source.metadata), state, sanitizeUrls)
  });
}

export function redactAllowlistedClaim(candidate, state, sanitizeUrls, summaryProjection = sanitizeUrls) {
  if (!sanitizeUrls) return structuredClone(candidate);

  return compact({
    id: redact(candidate.id, state),
    text: redactUrl(candidate.text, state),
    suggested_kind: redact(candidate.suggested_kind, state),
    classification_method: candidate.classification_method,
    review_status: candidate.review_status,
    reviewed_by: redact(candidate.reviewed_by, state),
    reviewed_at: candidate.reviewed_at,
    extracted_at: candidate.extracted_at,
    derivation_version: candidate.derivation_version,
    source_material: candidate.source_material,
    source_refs: (candidate.source_refs ?? []).map((ref) => compact({
      source_id: redact(ref.source_id, state),
      locator: redactUrl(ref.locator, state),
       note: summaryProjection ? undefined : redactUrl(ref.note, state),
        path: redactUrl(ref.path, state),
      url: redactUrl(ref.url, state),
      observed_at: ref.observed_at,
      source_updated_at: ref.source_updated_at,
      revision: ref.revision,
      content_hash: ref.content_hash,
        heading: summaryProjection ? undefined : redact(ref.heading, state),
        tableRow: summaryProjection ? undefined : ref.tableRow,
        line: summaryProjection ? undefined : ref.line
    }))
  });
}

export function redactDiagnostic(diagnostic, state) {
  return compact({
    type: diagnostic.type,
    severity: diagnostic.severity,
    source_id: redact(diagnostic.source_id, state),
    message: redactUrl(diagnostic.message, state)
  });
}

export function sensitiveKey(key) {
  return isCredentialKey(key);
}

// Keep structured-field and URL-query redaction on the same matcher. The
// canonical spellings intentionally include the variants emitted by Program
// and Truth integrations, as well as separator/camel-case variants.
export function isCredentialKey(key) {
  const decoded = decodeBounded(String(key));
  if (decoded === null) return true;
  const raw = decoded.toLowerCase();
  const normalized = raw.replace(/[^a-z0-9]/g, "");
  const exact = /^(?:password|passwd|passphrase|secret|token|apikey|xapikey|apitoken|credential|credentials|privatekey|accesskey|awsaccesskeyid|clientassertion|auth|authorization|authentication|bearer|cookie|session|sessionid|sessiontoken|sessionkey|signature|sig)(?:\d+|v\d+)?$/.test(normalized);
  const parts = raw.split(/[^a-z0-9]+/).filter(Boolean);
  return exact || parts.some((part) => part !== "session" && /^(?:password|passwd|passphrase|secret|token|apikey|xapikey|apitoken|credential|credentials|privatekey|accesskey|awsaccesskeyid|clientassertion|auth|authorization|authentication|bearer|cookie|sessionid|sessiontoken|sessionkey|signature|sig)(?:\d+|v\d+)?$/.test(part));
}

export function rawLikeKey(key) {
  const tokens = keyTokens(key);
  const normalized = tokens.join("");
  const exact = new Set([
    "body", "content", "contents", "raw", "text", "payload", "data",
    "document", "html", "markdown", "description", "descriptionmarkdown",
    "message", "prose", "blob", "rawbody", "rawcontent"
  ]);
  // Match canonical raw aliases by exact spelling or raw-bearing tokens, not
  // arbitrary substrings. In particular, database, metadata, data_source,
  // and context_id are legitimate structured keys.
  if (exact.has(normalized)) return true;
  if (["content_hash", "raw_included", "source_updated_at", "observed_at"].includes(String(key).toLowerCase())) return false;
  // Token matching catches integration spellings such as body_text and
  // nested_payload, but a control key such as raw_included is not material.
  const materialTokens = new Set([
    "body", "content", "contents", "payload", "document", "html",
    "markdown", "description", "message", "prose", "blob", "text"
  ]);
  return tokens.some((token) => materialTokens.has(token));
}

export function findRawMaterialKey(source) {
  return Object.keys(source ?? {}).find((key) => rawLikeKey(key) && source[key] !== undefined);
}

// Return every raw-like alias below a source, including its documented JSON
// path.  Normalization removes these values, but callers can still explain
// exactly what was excluded instead of silently dropping nested material.
export function findRawMaterialPaths(value, path = "$", paths = []) {
  if (!value || typeof value !== "object") return paths;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findRawMaterialPaths(entry, `${path}[${index}]`, paths));
    return paths;
  }
  for (const key of Object.keys(value).sort()) {
    const entryPath = `${path}.${key}`;
    if (rawLikeKey(key) && value[key] !== undefined) paths.push(entryPath);
    else findRawMaterialPaths(value[key], entryPath, paths);
  }
  return paths;
}

function keyTokens(key) {
  return String(key).replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function sanitizeStructured(value) {
  if (Array.isArray(value)) return value.map(sanitizeStructured);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !rawLikeKey(key))
        .map(([key, entry]) => sensitiveKey(key)
          ? ["[REDACTED_KEY]", "[REDACTED]"]
          : [key, sanitizeStructured(entry)])
    );
  }
  return value;
}

function redactObject(value, state, sanitizeUrls = false) {
  if (Array.isArray(value)) return value.map((entry) => redactObject(entry, state, sanitizeUrls));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (sensitiveKey(key) || key === "[REDACTED_KEY]") {
        state.changed = true;
        return ["[REDACTED_KEY]", "[REDACTED]"];
      }
      return [redactKey(key, state), redactObject(entry, state, sanitizeUrls)];
    }));
  }
  return sanitizeUrls ? redactUrl(value, state) : redact(value, state);
}

function redactKey(key, state) {
  if (sensitiveKey(key)) {
    state.changed = true;
    return "[REDACTED_KEY]";
  }
  return redact(key, state);
}

function redact(value, state) {
  if (typeof value !== "string") return value;
  const output = redactPatterns(value);
  if (output !== value) state.changed = true;
  return output;
}

function redactCredentialValue(match) {
  const separator = match.search(/[:=]/);
  return separator < 0 ? "[REDACTED]" : `${match.slice(0, separator + 1)} [REDACTED]`;
}

function redactUrl(value, state) {
  if (typeof value !== "string") return value;
  const sanitized = sanitizeCredentialUrls(value);
  const output = redactPatterns(sanitized);
  if (output !== value) state.changed = true;
  return output;
}

function sanitizeEncodedUrl(candidate) {
  const decoded = decodeBounded(candidate);
  if (decoded === null) return "[REDACTED_URL]";
  return encodeURIComponent(sanitizeStandaloneUrl(decoded));
}

function sanitizeStandaloneUrl(value) {
  if (!parseUrl(value)) return scrubUrlQueryAndFragment(stripUrlUserinfo(value));
  return scrubUrlQueryAndFragment(stripUrlUserinfo(value));
}

function parseUrl(value) {
  try {
    return value.startsWith("//") ? new URL(`https:${value}`) : new URL(value);
  } catch {
    return null;
  }
}

function unsafeScheme(value, key) {
  const text = String(value).trim();
  if (/^[a-z]:[\\/]/i.test(text)) return false;
  const match = /^([a-z][a-z\d+.-]*):/i.exec(text);
  if (!match) return false;
  return !/^https?$/i.test(match[1]);
}

function stripUrlUserinfo(value) {
  if (!/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(value)) return value;
  const authorityStart = value.indexOf("//") + 2;
  const authorityEnd = ["/", "?", "#"]
    .map((mark) => value.indexOf(mark, authorityStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const end = authorityEnd < 0 ? value.length : authorityEnd;
  const userinfoEnd = value.lastIndexOf("@", end);
  return userinfoEnd > authorityStart
    ? `${value.slice(0, authorityStart)}${value.slice(userinfoEnd + 1)}`
    : value;
}

function scrubUrlQueryAndFragment(value) {
  const hashStart = value.indexOf("#");
  const beforeHash = hashStart < 0 ? value : value.slice(0, hashStart);
  const fragment = hashStart < 0 ? "" : value.slice(hashStart + 1);
  const queryStart = beforeHash.indexOf("?");
  const base = queryStart < 0 ? beforeHash : beforeHash.slice(0, queryStart);
  const query = queryStart < 0 ? "" : beforeHash.slice(queryStart + 1);
  const cleanQuery = queryStart < 0 ? "" : scrubParameterString(query);
  const cleanFragment = fragment ? scrubFragment(fragment) : "";
  return `${base}${queryStart < 0 ? "" : cleanQuery.value ? `?${cleanQuery.value}` : ""}${hashStart < 0 ? "" : cleanFragment ? `#${cleanFragment}` : ""}`;
}

function scrubParameterString(query) {
  const kept = [];
  for (const part of String(query).split("&")) {
    const equals = part.indexOf("=");
    const rawKey = equals < 0 ? part : part.slice(0, equals);
    const rawValue = equals < 0 ? "" : part.slice(equals + 1);
    const key = decodeQueryComponent(rawKey);
    const queryValue = decodeQueryComponent(rawValue);
    if (key === null || queryValue === null || credentialQueryKey(key) || credentialQueryValue(queryValue)) continue;
    if (equals < 0 && key.includes("=")) {
      const nested = scrubParameterString(key);
      if (nested.value) kept.push(nested.value);
      continue;
    }
    const nested = sanitizeCredentialUrls(queryValue);
    kept.push(nested === queryValue ? part : `${rawKey}=${encodeQueryComponent(nested)}`);
  }
  return { value: kept.join("&") };
}

function scrubFragment(fragment) {
  const decoded = decodeQueryComponent(fragment);
  if (decoded === null) return "";
  if (/(?:[a-z][a-z\d+.-]*:)?\/\//i.test(decoded)) return sanitizeCredentialUrls(decoded);
  return /[=&]/.test(decoded)
    ? scrubParameterString(decoded).value
    : scrubParameterString(fragment).value;
}

function credentialQueryKey(key) {
  return isCredentialKey(key);
}

function credentialQueryValue(value) {
  return redactPatterns(value) !== value
    || /^(?:bearer|basic)\s+/i.test(value)
    || /(?:https?:)?\/\/[^\s/]+:[^\s/]*@/i.test(value)
    || /(?:[a-z][a-z\d+.-]*:)?\/\/[^\s/]+/i.test(value);
}

function decodeQueryComponent(value) {
  return decodeBounded(String(value).replace(/\+/g, " "));
}

function decodeBounded(value) {
  let decoded = String(value);
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return null;
    }
  }
  return /%[0-9a-f]{2}/i.test(decoded) ? null : decoded;
}

function encodeQueryComponent(value) {
  return encodeURIComponent(value);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}
