import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createConfluenceCompactAdapter, createJiraCompactAdapter } from "./adapters.js";
import { createEvidencePack, renderEvidencePack, validateEvidencePack } from "./evidence-pack.js";
import { listCaptureTools } from "./mcp-tools.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function runDoctor() {
  const checks = [
    checkInstall(),
    checkSchema(),
    checkRender(),
    checkAdapters(),
    checkMcp()
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

function checkInstall() {
  const required = [
    resolve(ROOT, "package.json"),
    resolve(ROOT, "bin", "capture-truth.js"),
    resolve(ROOT, "src", "evidence-pack.js"),
    resolve(ROOT, "src", "mcp-server.js")
  ];
  const missing = required.filter((path) => !existsSync(path));
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

  return {
    name: "install",
    ok: missing.length === 0 && nodeMajor >= 22 && Boolean(pkg.bin?.["capture-truth-mcp"]),
    message:
      missing.length === 0
        ? `Node ${process.versions.node}; package files present`
        : `Missing: ${missing.join(", ")}`
  };
}

function checkSchema() {
  const pack = createEvidencePack({
    sources: [
      {
        id: "local-note",
        type: "text",
        captured_at: "2026-05-14T00:00:00Z",
        freshness: "stale",
        content: "DEMO-2944 example-rollout start date is 2026-05-27."
      },
      {
        id: "jira",
        type: "text",
        captured_at: "2026-05-14T01:00:00Z",
        freshness: "fresh",
        content: "DEMO-2944 example-rollout start date is 2026-06-02."
      }
    ]
  });
  const validation = validateEvidencePack(pack);

  return {
    name: "schema",
    ok:
      pack.kind === "evidence_pack" &&
      pack.conflicts[0]?.conflict_type === "date_mismatch" &&
      Array.isArray(validation.gaps),
    message: "Evidence pack, validation, and first-class conflict schemas are available"
  };
}

function checkRender() {
  const pack = createEvidencePack({
    sources: [
      {
        id: "doctor-note",
        type: "text",
        captured_at: "2026-05-14T00:00:00Z",
        freshness: "fresh",
        content: "Fixture credential api_key=REDACTED_EXAMPLE should not render in repo-safe output."
      }
    ]
  });
  const rendered = renderEvidencePack(pack, {
    format: "markdown",
    export_profile: "repo-safe-summary"
  });

  return {
    name: "render",
    ok:
      rendered.includes("Export profile: repo-safe-summary") &&
      rendered.includes("Redaction warnings") &&
      !rendered.includes("abc123"),
    message: "Repo-safe render and redaction checks succeeded"
  };
}

function checkAdapters() {
  const jira = createJiraCompactAdapter({ now: () => new Date("2026-05-14T00:00:00Z") }).read({
    key: "DEMO-2944",
    summary: "Example rollout",
    status: "In Progress",
    updated_at: "2026-05-13T00:00:00Z"
  });
  const confluence = createConfluenceCompactAdapter({ now: () => new Date("2026-05-14T00:00:00Z") }).read({
    id: "DOCS-7550",
    title: "Example readiness",
    updated_at: "2026-05-13T00:00:00Z"
  });

  return {
    name: "adapters",
    ok:
      jira.adapter === "jira_compact" &&
      confluence.adapter === "confluence_compact" &&
      jira.metadata.raw_body_included === false &&
      confluence.metadata.raw_body_included === false,
    message: "Compact Jira and Confluence adapters are available"
  };
}

function checkMcp() {
  const names = listCaptureTools().map((tool) => tool.name);
  const expected = [
    "create_evidence_pack",
    "validate_evidence_pack",
    "render_evidence_pack",
    "refine_evidence_pack",
    "run_capture_benchmark_fixture"
  ];
  const missing = expected.filter((name) => !names.includes(name));

  return {
    name: "mcp",
    ok: missing.length === 0,
    message: missing.length === 0 ? "MCP tool surface is available" : `Missing tools: ${missing.join(", ")}`
  };
}
