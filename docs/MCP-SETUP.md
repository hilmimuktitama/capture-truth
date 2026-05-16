# MCP Setup

`capture-truth` exposes two stdio MCP servers:

- `capture-truth`: capture-only legacy surface.
- `truth-tools`: aggregate capture, program, timeline, benchmark, and doctor surface.

## Agent-Assisted Setup

Give this prompt to an MCP-capable AI agent when you want it to install and configure `capture-truth` for you:

```text
Let's use capture-truth from https://github.com/hilmimuktitama/capture-truth.

Please inspect the repository README and setup docs, confirm this machine has Node.js 22 or newer, and configure an MCP server named capture-truth.

Prefer the npm package setup:

{
  "mcpServers": {
    "capture-truth": {
      "command": "npx",
      "args": ["-y", "--package=capture-truth", "capture-truth-mcp"]
    }
  }
}

If npm setup is unavailable, use a local checkout fallback: clone the GitHub repo, run npm install, and configure the MCP server with command node and args pointing to <repo>/src/mcp-server.js.

After setup, run the matching doctor command: for npm setup, run `npx -y --package=capture-truth capture-truth doctor`; for local checkout setup, run `node bin/capture-truth.js doctor` from the cloned repo. Then smoke-test the MCP server by calling create_evidence_pack with one text source, validate_evidence_pack, and render_evidence_pack as Markdown with export_profile set to repo-safe-summary.

Do not infer status, risk, ownership, or timeline truth. Only capture source-backed evidence, validation gaps, unresolved conflicts, and assumptions.
```

The agent should locate and update its own MCP configuration file according to the client it is running in. The raw config examples below are intentionally generic.

## Local Checkout

From this repository:

```bash
npm install
capture-truth doctor
truth-tools doctor --all
node src/mcp-server.js
node src/truth-mcp-server.js
```

Use this MCP config while developing locally:

```json
{
  "mcpServers": {
    "capture-truth": {
      "command": "node",
      "args": ["C:/path/to/capture-truth/src/mcp-server.js"]
    },
    "truth-tools": {
      "command": "node",
      "args": ["C:/path/to/capture-truth/src/truth-mcp-server.js"]
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
    },
    "truth-tools": {
      "command": "npx",
      "args": ["-y", "--package=capture-truth", "truth-tools-mcp"]
    }
  }
}
```

## Smoke Test Prompt

```text
Use the capture-truth MCP server. Call create_evidence_pack with one text source, then call validate_evidence_pack and render_evidence_pack as Markdown. Do not infer status, risk, or timeline truth.
```

Aggregate smoke prompt:

```text
Use the truth-tools MCP server. First call truth_tools.doctor with all=true. Then call capture.create with one text source, capture.validate, and capture.render as Markdown with export_profile repo-safe-summary.
```

For repo artifacts, pass `export_profile: "repo-safe-summary"` to `render_evidence_pack` so raw source bodies are omitted before Markdown leaves the local workspace.

Expected result:

- `create_evidence_pack` returns `kind: evidence_pack`.
- Every extracted claim has `source_refs`.
- Validation reports missing freshness or capture metadata when the source omits them.
- Markdown render includes Sources, Claims, Gaps, Conflicts, and Assumptions.
- Repo-safe render includes summary metadata, gaps, conflicts, assumptions, and redaction warnings without raw source bodies.
- Aggregate MCP lists `capture.create`, `capture.validate`, `capture.render`, `program.reconcile`, `timeline.create`, `timeline.validate`, `timeline.render`, `benchmark.fixture`, and `truth_tools.doctor`.

For local setup validation, run `capture-truth doctor`. It checks package files, evidence schemas, repo-safe rendering, compact Jira/Confluence adapters, and the MCP tool list.

For deterministic benchmark validation, call `run_capture_benchmark_fixture` or run `capture-truth benchmark --json`. The fixture covers stale local notes, fresh Jira/Confluence compact intake, source conflicts, repo-safe export, and redaction warnings.
