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
      const content = fs.readFileSync(input.path, "utf8");
      return {
        id: input.id ?? input.path,
        type: input.type ?? inferType(input.path),
        path: input.path,
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

function inferType(path) {
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".csv")) return "csv";
  if (path.endsWith(".json")) return "json";
  return "text";
}
