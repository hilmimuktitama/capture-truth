# Capture Truth

Status: v0.1.0 local-first implementation. MIT licensed. Requires Node.js 22 or newer.

`capture-truth` is a reusable evidence intake package for AI-agent TPM and operator workflows. It turns pasted text, local files, CSV/JSON exports, and read-only adapter outputs into a neutral `evidence_pack` with source snapshots, extracted claims, source refs, freshness metadata, validation gaps, unresolved conflicts, and portable renders.

It deliberately stops before status, risk, or timeline judgment. Use it to preserve what was captured and where it came from, then hand the pack to downstream workflows such as `program-truth` or `timeline-truth`.

Repository: https://github.com/hilmimuktitama/capture-truth

## First Use

```json
{
  "sources": [
    {
      "id": "status-note",
      "type": "text",
      "path": "notes/status.txt",
      "captured_at": "2026-05-12T14:00:00Z",
      "freshness": "fresh",
      "content": "API contract is blocked by missing owner by 2026-05-20."
    }
  ]
}
```

Ask your agent:

```text
Use the capture-truth MCP server. Call create_evidence_pack with this source intake, then validate it and render the Markdown output. Do not infer status, risk, or timeline truth.
```

## Install

Local checkout:

```bash
npm install
npm test
capture-truth doctor
node src/mcp-server.js
```

See [docs/MCP-SETUP.md](docs/MCP-SETUP.md) for local and npm MCP config examples.

Npm package config:

```json
{
  "mcpServers": {
    "capture-truth": {
      "command": "npx",
      "args": ["-y", "--package=capture-truth", "capture-truth-mcp"]
    }
  }
}
```

CLI:

```bash
capture-truth doctor
capture-truth benchmark --json
capture-truth create --json-out < intake.json
capture-truth validate < evidence-pack.json
capture-truth render --format markdown < evidence-pack.json
capture-truth render --format markdown --export-profile repo-safe-summary < evidence-pack.json
```

## MCP Tools

- `create_evidence_pack`: compile sources into neutral evidence pack JSON.
- `validate_evidence_pack`: report missing source refs, missing capture metadata, stale sources, duplicate source ids, and unresolved conflicts.
- `render_evidence_pack`: render as Markdown or JSON, optionally with an export profile.
- `refine_evidence_pack`: apply reviewer edits while preserving `source_refs` unless explicitly replaced.
- `run_capture_benchmark_fixture`: run a deterministic fixture covering stale sources, source conflicts, repo-safe export, and redaction checks.

## Export Profiles

`capture-truth` supports explicit export profiles when rendering evidence packs:

- `repo-safe-summary`: Markdown summary for committing to TPM repos. It omits raw source bodies and reports redaction warnings when source material contains common credential or sensitive-data markers.
- `internal-evidence-pack`: structured evidence output with raw `content` fields replaced by `content_redacted: true`.
- `raw-local-only`: full local render. Do not commit raw Jira, Confluence, customer, credential, or private operational data.

Use `repo-safe-summary` as the default for repo artifacts.

## Conflict Object

Unresolved source conflicts are emitted as actionable reconciliation objects:

```json
{
  "claim": "TF-2944 date",
  "source_a": {
    "system": "local-note",
    "value": "2026-05-27",
    "captured_at": "2026-05-14T00:00:00Z",
    "freshness": "stale"
  },
  "source_b": {
    "system": "jira",
    "value": "2026-06-02",
    "captured_at": "2026-05-14T01:00:00Z",
    "freshness": "fresh"
  },
  "conflict_type": "date_mismatch",
  "recommended_owner_action": "Assign an owner to reconcile the source disagreement and update the system of record."
}
```

The current detector handles direct claim disagreement and same-ticket date mismatches. It preserves the conflicting source metadata so downstream workflows can assign reconciliation work instead of flattening ambiguity.

## Adapter Contract

Adapters are read-only in v0. An adapter exposes:

- `id`
- `type`
- `read(input)`
- `metadata`
- `capabilities`

Every adapter result must preserve raw source identity and capture timestamp. The package includes local-file and fixture adapter helpers in `src/adapters.js`.

## Compact Intake Adapters

`capture-truth` includes read-only compact intake helpers for Jira and Confluence. They are designed for agents or wrappers that have already fetched source metadata and need a safe source-shaped record without storing raw issue descriptions or page bodies.

Jira compact intake preserves fields such as key, summary, status, assignee, parent, URL, `captured_at`, and freshness:

```js
import { createJiraCompactAdapter } from "capture-truth/src/adapters.js";

const source = createJiraCompactAdapter().read({
  key: "TF-2944",
  summary: "Real-client rollout",
  status: "In Progress",
  assignee: "Platform",
  updated_at: "2026-05-13T12:00:00Z",
  url: "https://example.atlassian.net/browse/TF-2944"
});
```

Confluence compact intake preserves page id/title/space/status/version/update metadata and URL. Both adapters set `metadata.raw_body_included: false` and compute `freshness` from `updated_at` unless a caller provides a freshness label.

## Doctor

`capture-truth doctor` smoke-tests:

- package install and Node version
- evidence pack and validation schema
- first-class conflict objects
- repo-safe render and redaction checks
- compact Jira/Confluence adapters
- MCP tool-surface availability

## Benchmark Fixture

`capture-truth benchmark --json` returns a deterministic fixture result for comparing capture behavior across agents and runs. The fixture includes:

- a stale local note
- fresh compact Jira evidence
- fresh compact Confluence evidence
- a same-ticket date conflict
- a readiness claim disagreement
- sensitive source text that must not appear in `repo_safe_summary`

The MCP tool `run_capture_benchmark_fixture` returns the same JSON shape. Use this before a real TPM review when you want to confirm that capture, validation, conflict detection, repo-safe rendering, redaction checks, and compact adapters are all working together.

## Boundaries

Good fits:

- capturing source material before analysis
- preserving provenance for messy program evidence
- creating a handoff artifact for status, risk, dependency, or timeline workflows
- surfacing source-quality gaps early

Poor fits:

- deciding whether a program is green/yellow/red
- reconstructing final program truth
- generating timelines or schedules
- writing to Jira, Confluence, Notion, or any external system

## Development

```bash
npm install
npm test
npm run check
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
