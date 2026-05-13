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
capture-truth create --json-out < intake.json
capture-truth validate < evidence-pack.json
capture-truth render --format markdown < evidence-pack.json
```

## MCP Tools

- `create_evidence_pack`: compile sources into neutral evidence pack JSON.
- `validate_evidence_pack`: report missing source refs, missing capture metadata, stale sources, duplicate source ids, and unresolved conflicts.
- `render_evidence_pack`: render as Markdown or JSON.
- `refine_evidence_pack`: apply reviewer edits while preserving `source_refs` unless explicitly replaced.

## Adapter Contract

Adapters are read-only in v0. An adapter exposes:

- `id`
- `type`
- `read(input)`
- `metadata`
- `capabilities`

Every adapter result must preserve raw source identity and capture timestamp. The package includes local-file and fixture adapter helpers in `src/adapters.js`.

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
