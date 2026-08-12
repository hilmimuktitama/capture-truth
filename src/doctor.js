import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeJiraIssue } from "./adapters.js";
import { buildProfileExport, createEvidencePack } from "./capture.js";
import { listCaptureTools } from "./mcp-tools.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runDoctor() {
  const checks = [checkInstall(), checkAdapters(), checkCapture(), checkMcp()];
  return { ok: checks.every((check) => check.ok), checks };
}

function checkInstall() {
  const required = ["package.json", "bin/capture-truth.js", "src/mcp-server.js"].map((path) => resolve(ROOT, path));
  const missing = required.filter((path) => !existsSync(path));
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  return {
    name: "install",
    ok: missing.length === 0 && Number(process.versions.node.split(".")[0]) >= 22 && pkg.version === "0.4.1",
    message: missing.length ? `Missing: ${missing.join(", ")}` : `Node ${process.versions.node}; v${pkg.version} files present`
  };
}

function checkAdapters() {
  const source = normalizeJiraIssue({
    key: "DEMO-1", summary: "Rollout", status: "In Progress", updated_at: "2026-05-13T00:00:00Z", description: "private"
  });
  return {
    name: "adapters",
    ok: source.fields.status === "In Progress" && source.metadata.raw_body_included === false && !Object.hasOwn(source, "content"),
    message: "Compact adapters emit structured fields without raw bodies"
  };
}

function checkCapture() {
  const now = () => new Date("2026-05-14T00:00:00Z");
  const pack = createEvidencePack({ sources: [{ id: "capture-demo", locator: "demo", raw: "Status: In Progress\nOwner: TBD\n" }], now });
  const portable = buildProfileExport(pack, "repo-safe-summary");
  const portableText = JSON.stringify(portable);
  return {
    name: "capture",
    ok: pack.candidate_claims.length >= 2
      && pack.candidate_claims.every((claim) => claim.review_status === "unreviewed"
        && claim.classification_method === "keyword"
        && claim.derivation_version === "0.4.1"
        && ["raw_body", "structured_fields", "metadata", "mixed"].includes(claim.source_material)
        && !Object.hasOwn(claim, "kind"))
      && !portableText.includes("Internal heading")
      && !portableText.includes("hidden marker"),
    message: "Candidate claims are unreviewed keyword suggestions; portable exports exclude raw bodies"
  };
}

function checkMcp() {
  const names = listCaptureTools().map((tool) => tool.name);
  const expected = ["capture.normalize", "capture.evidence_pack", "capture.doctor"];
  return {
    name: "mcp",
    ok: expected.every((name) => names.includes(name)),
    message: "Read-only capture MCP tools are available"
  };
}
