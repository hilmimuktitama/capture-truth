import { isAbsolute, relative, resolve } from "node:path";

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
      return {
        id: input.id ?? relative(basePath, requestedPath),
        type: input.type ?? inferType(requestedPath),
        path: relative(basePath, requestedPath),
        adapter: "local_file",
        captured_at: new Date().toISOString(),
        freshness: input.freshness ?? "captured",
        access_caveats: input.access_caveats ?? [],
        metadata: { base_dir: baseDir },
        content
      };
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
      return {
        id: input.id ?? key,
        type: fixture.type ?? "text",
        key,
        adapter: "fixture",
        captured_at: input.captured_at ?? new Date().toISOString(),
        freshness: input.freshness ?? fixture.freshness ?? "fixture",
        access_caveats: fixture.access_caveats ?? [],
        metadata: fixture.metadata ?? {},
        content: fixture.content
      };
    }
  };
}

export function createJiraCompactAdapter({ now = () => new Date(), freshWithinDays = 2 } = {}) {
  return {
    id: "jira-compact",
    type: "jira_compact",
    metadata: {
      read_only: true,
      compact_intake: true,
      raw_body_included: false,
      fresh_within_days: freshWithinDays
    },
    capabilities: ["read"],
    read(input = {}) {
      if (!input.key) {
        throw new Error("jira-compact adapter requires input.key.");
      }
      const capturedAt = normalizeDate(now()).toISOString();
      const updatedAt = input.updated_at ?? input.updated ?? input.fields?.updated;
      const fields = compactObject({
        key: input.key,
        summary: input.summary ?? input.fields?.summary,
        status: input.status ?? input.fields?.status?.name,
        assignee: input.assignee ?? input.fields?.assignee?.displayName,
        parent: input.parent ?? input.fields?.parent?.key,
        updated_at: updatedAt,
        url: input.url
      });

      return {
        id: input.id ?? `jira-${input.key}`,
        type: "text",
        key: input.key,
        url: input.url ?? null,
        adapter: "jira_compact",
        captured_at: capturedAt,
        freshness: input.freshness ?? freshnessFromUpdatedAt(updatedAt, capturedAt, freshWithinDays),
        access_caveats: input.access_caveats ?? [],
        metadata: {
          source_system: "jira",
          updated_at: updatedAt ?? null,
          compact_intake: true,
          raw_body_included: false
        },
        content: renderCompactFields("Jira issue", fields)
      };
    }
  };
}

export function createConfluenceCompactAdapter({ now = () => new Date(), freshWithinDays = 7 } = {}) {
  return {
    id: "confluence-compact",
    type: "confluence_compact",
    metadata: {
      read_only: true,
      compact_intake: true,
      raw_body_included: false,
      fresh_within_days: freshWithinDays
    },
    capabilities: ["read"],
    read(input = {}) {
      const pageId = input.id ?? input.page_id;
      if (!pageId) {
        throw new Error("confluence-compact adapter requires input.id or input.page_id.");
      }
      const capturedAt = normalizeDate(now()).toISOString();
      const updatedAt = input.updated_at ?? input.updated ?? input.version?.when;
      const fields = compactObject({
        id: pageId,
        title: input.title,
        space: input.space ?? input.space_key,
        status: input.status,
        version: typeof input.version === "object" ? input.version.number : input.version,
        updated_at: updatedAt,
        url: input.url
      });

      return {
        id: input.source_id ?? `confluence-${pageId}`,
        type: "text",
        key: pageId,
        url: input.url ?? null,
        adapter: "confluence_compact",
        captured_at: capturedAt,
        freshness: input.freshness ?? freshnessFromUpdatedAt(updatedAt, capturedAt, freshWithinDays),
        access_caveats: input.access_caveats ?? [],
        metadata: {
          source_system: "confluence",
          updated_at: updatedAt ?? null,
          compact_intake: true,
          raw_body_included: false
        },
        content: renderCompactFields("Confluence page", fields)
      };
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

function renderCompactFields(label, fields) {
  return [
    `${label} compact intake`,
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`)
  ].join("\n");
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
