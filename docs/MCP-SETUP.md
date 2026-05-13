# MCP Setup

`capture-truth` exposes a stdio MCP server named `capture-truth`.

## Local Checkout

From this repository:

```bash
npm install
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

Expected result:

- `create_evidence_pack` returns `kind: evidence_pack`.
- Every extracted claim has `source_refs`.
- Validation reports missing freshness or capture metadata when the source omits them.
- Markdown render includes Sources, Claims, Gaps, Conflicts, and Assumptions.
