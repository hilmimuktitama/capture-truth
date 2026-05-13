# MCP Setup

`capture-truth` exposes a stdio MCP server named `capture-truth`.

## Local Checkout

From this repository:

```bash
npm install
capture-truth doctor
node src/mcp-server.js
```

Use this MCP config while developing locally:

```json
{
  "mcpServers": {
    "capture-truth": {
      "command": "node",
      "args": ["C:/path/to/capture-truth/src/mcp-server.js"]
    }
  }
}
```

## Npm Package

After publishing:

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

## Smoke Test Prompt

```text
Use the capture-truth MCP server. Call create_evidence_pack with one text source, then call validate_evidence_pack and render_evidence_pack as Markdown. Do not infer status, risk, or timeline truth.
```

For repo artifacts, pass `export_profile: "repo-safe-summary"` to `render_evidence_pack` so raw source bodies are omitted before Markdown leaves the local workspace.

Expected result:

- `create_evidence_pack` returns `kind: evidence_pack`.
- Every extracted claim has `source_refs`.
- Validation reports missing freshness or capture metadata when the source omits them.
- Markdown render includes Sources, Claims, Gaps, Conflicts, and Assumptions.
- Repo-safe render includes summary metadata, gaps, conflicts, assumptions, and redaction warnings without raw source bodies.

For local setup validation, run `capture-truth doctor`. It checks package files, evidence schemas, repo-safe rendering, compact Jira/Confluence adapters, and the MCP tool list.

For deterministic benchmark validation, call `run_capture_benchmark_fixture` or run `capture-truth benchmark --json`. The fixture covers stale local notes, fresh Jira/Confluence compact intake, source conflicts, repo-safe export, and redaction warnings.
