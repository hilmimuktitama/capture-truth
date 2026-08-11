// src/adapters.js
//
// Read-only adapters that normalize already-fetched compact records. They
// never fetch. The Jira/Confluence compact normalizers never carry raw bodies
// (raw_body_included: false); the local_file and fixture adapters carry raw
// content only when raw_included is true — and only when raw content exists.
//
// The honest names are normalizeJiraIssue and normalizeConfluencePage.
// createJiraCompactAdapter and createConfluenceCompactAdapter are deprecated
// aliases that wrap the same normalization; use the normalize* names in new
// code.

import { isAbsolute, relative, resolve } from "node:path";

import { canonicalLocator, hashContent, normalizeTimestamp } from "./capture.js";

export function createLocalFileAdapter({ fs, baseDir = process.cwd() } = {}) {
  if (!fs?.readFileSync) {
    throw new Error("createLocalFileAdapter requires an fs-like object with readFileSync.");
  }

  return {
    id: "local-file",
    type: "local_file",
    metadata: {
      base_dir: baseDir,
      read_only: true
    },
    capabilities: ["read"],
    read(input = {}) {
      if (!input.path) {
        throw new Error("local-file adapter requires input.path.");
      }
      const basePath = resolve(baseDir);
      const requestedPath = isAbsolute(input.path) ? resolve(input.path) : resolve(basePath, input.path);
      assertWithinBase(basePath, requestedPath);
      if (fs.realpathSync) {
        assertWithinBase(fs.realpathSync(basePath), fs.realpathSync(requestedPath));
      }
      const content = fs.readFileSync(requestedPath, "utf8");
      const rawIncluded = input.raw_included !== false;
      const record = {
        id: input.id ?? relative(basePath, requestedPath),
        type: input.type ?? inferType(requestedPath),
        path: relative(basePath, requestedPath),
        adapter: "local_file",
        observed_at: normalizeTimestamp(input.observed_at ?? new Date().toISOString()),
        source_updated_at: normalizeTimestamp(input.source_updated_at ?? input.updated_at ?? null),
        revision: input.revision ?? null,
        freshness: input.freshness ?? "captured",
        access_caveats: input.access_caveats ?? [],
        metadata: { base_dir: baseDir },
        raw_included: rawIncluded,
        fields: input.fields
      };
      if (rawIncluded) record.raw = content;
      return record;
    }
  };
}

export function createFixtureAdapter({ fixtures = {} } = {}) {
  return {
    id: "fixture",
    type: "fixture",
    metadata: {
      read_only: true,
      fixture_count: Object.keys(fixtures).length
    },
    capabilities: ["read"],
    read(input = {}) {
      const key = input.key ?? input.id;
      if (!key || !Object.hasOwn(fixtures, key)) {
        throw new Error(`fixture adapter cannot find key: ${key ?? "<missing>"}`);
      }
      const fixture = fixtures[key];
      // Raw inclusion invariant: raw exists exactly when raw_included is true.
      // raw_included defaults to the fixture's raw_included flag and otherwise
      // to whether the fixture carries raw content; an explicit input flag
      // overrides the fixture default. raw_included=true with no raw content
      // (on either side) normalizes back to false so the invariant can never
      // silently fail.
      const fixtureRaw = fixture.raw;
      const rawIncluded = (input.raw_included ?? fixture.raw_included ?? fixtureRaw !== undefined)
        && fixtureRaw !== undefined && fixtureRaw !== null;
      const record = {
        id: input.id ?? key,
        type: fixture.type ?? "text",
        key,
        adapter: "fixture",
        observed_at: normalizeTimestamp(input.observed_at ?? input.captured_at ?? new Date().toISOString()),
        source_updated_at: normalizeTimestamp(input.source_updated_at ?? input.updated_at ?? fixture.source_updated_at ?? null),
        revision: input.revision ?? fixture.revision ?? null,
        freshness: input.freshness ?? fixture.freshness ?? "fixture",
        access_caveats: fixture.access_caveats ?? [],
        metadata: fixture.metadata ?? {},
        raw_included: rawIncluded,
        fields: fixture.fields
      };
      if (rawIncluded) record.raw = fixtureRaw;
      return record;
    }
  };
}

// Normalizes an already-fetched compact Jira issue into a capture source
// record. Raw descriptions never enter the record.
export function normalizeJiraIssue(input = {}, { now = () => new Date(), freshWithinDays = 2 } = {}) {
  if (!input.key) {
    throw new Error("normalizeJiraIssue requires input.key.");
  }
  const capturedAt = normalizeDate(now()).toISOString();
  const updatedAt = normalizeTimestamp(input.updated_at ?? input.source_updated_at ?? input.fields?.updated);
  const fields = compactObject({
    key: input.key,
    summary: input.summary ?? input.fields?.summary,
    status: input.status ?? input.fields?.status?.name,
    assignee: input.assignee ?? input.fields?.assignee?.displayName,
    parent: input.parent ?? input.fields?.parent?.key,
    updated_at: updatedAt,
    url: input.url
  });

  return compactObject({
    id: input.id ?? `jira-${input.key}`,
    kind: "record",
    type: "record",
    key: input.key,
    url: input.url ?? null,
    path: null,
    adapter: "jira_compact",
    observed_at: normalizeTimestamp(input.observed_at ?? capturedAt),
    source_updated_at: updatedAt,
    revision: input.revision ?? input.fields?.revision ?? null,
    content_hash: hashContent(fields),
    locator: canonicalLocator({ locator: input.locator, path: input.path, url: input.url, key: input.key, id: input.id ?? `jira-${input.key}` }),
    access_caveats: input.access_caveats ?? [],
    raw_included: false,
    freshness: input.freshness ?? freshnessFromUpdatedAt(updatedAt, capturedAt, freshWithinDays),
    metadata: {
      source_system: "jira",
      updated_at: updatedAt ?? null,
      compact_intake: true,
      raw_body_included: false,
      fresh_within_days: freshWithinDays
    },
    fields
  });
}

// Normalizes an already-fetched compact Confluence page into a capture source
// record. Raw page bodies never enter the record.
export function normalizeConfluencePage(input = {}, { now = () => new Date(), freshWithinDays = 7 } = {}) {
  const pageId = input.id ?? input.page_id;
  if (!pageId) {
    throw new Error("normalizeConfluencePage requires input.id or input.page_id.");
  }
  const capturedAt = normalizeDate(now()).toISOString();
  const updatedAt = normalizeTimestamp(input.updated_at ?? input.source_updated_at ?? input.version?.when);
  const fields = compactObject({
    id: pageId,
    title: input.title,
    space: input.space ?? input.space_key,
    status: input.status,
    version: typeof input.version === "object" ? input.version.number : input.version,
    updated_at: updatedAt,
    url: input.url
  });

  return compactObject({
    id: input.source_id ?? `confluence-${pageId}`,
    kind: "record",
    type: "record",
    key: pageId,
    url: input.url ?? null,
    path: null,
    adapter: "confluence_compact",
    observed_at: normalizeTimestamp(input.observed_at ?? capturedAt),
    source_updated_at: updatedAt,
    revision: input.revision ?? (typeof input.version === "object" ? input.version.number : input.version) ?? null,
    content_hash: hashContent(fields),
    locator: canonicalLocator({ locator: input.locator, path: input.path, url: input.url, key: pageId, id: input.source_id ?? `confluence-${pageId}` }),
    access_caveats: input.access_caveats ?? [],
    raw_included: false,
    freshness: input.freshness ?? freshnessFromUpdatedAt(updatedAt, capturedAt, freshWithinDays),
    metadata: {
      source_system: "confluence",
      updated_at: updatedAt ?? null,
      compact_intake: true,
      raw_body_included: false,
      fresh_within_days: freshWithinDays
    },
    fields
  });
}

/**
 * @deprecated Use normalizeJiraIssue(input, options) directly. The adapter
 * class shape is retained as a documented alias for existing callers.
 */
export function createJiraCompactAdapter(options = {}) {
  return {
    id: "jira-compact",
    type: "jira_compact",
    metadata: {
      read_only: true,
      compact_intake: true,
      raw_body_included: false,
      fresh_within_days: options.freshWithinDays ?? 2
    },
    capabilities: ["read"],
    read(input = {}) {
      return normalizeJiraIssue(input, options);
    }
  };
}

/**
 * @deprecated Use normalizeConfluencePage(input, options) directly. The
 * adapter class shape is retained as a documented alias for existing callers.
 */
export function createConfluenceCompactAdapter(options = {}) {
  return {
    id: "confluence-compact",
    type: "confluence_compact",
    metadata: {
      read_only: true,
      compact_intake: true,
      raw_body_included: false,
      fresh_within_days: options.freshWithinDays ?? 7
    },
    capabilities: ["read"],
    read(input = {}) {
      return normalizeConfluencePage(input, options);
    }
  };
}

function inferType(path) {
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".csv")) return "csv";
  if (path.endsWith(".json")) return "json";
  return "text";
}

function freshnessFromUpdatedAt(updatedAt, capturedAt, freshWithinDays) {
  if (!updatedAt) return "unknown";
  const updated = Date.parse(updatedAt);
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(updated) || !Number.isFinite(captured)) return "unknown";
  const ageMs = captured - updated;
  if (ageMs < 0) return "unknown";
  const freshWindowMs = freshWithinDays * 24 * 60 * 60 * 1000;
  return ageMs <= freshWindowMs ? "fresh" : "stale";
}

function normalizeDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function assertWithinBase(basePath, requestedPath) {
  const relation = relative(basePath, requestedPath);
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) return;
  throw new Error(`local-file adapter path escapes baseDir: ${requestedPath}`);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
  );
}
