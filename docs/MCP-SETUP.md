# MCP setup

Run `npx capture-truth-mcp` with an MCP client. The server is read-only and exposes `capture.normalize`, `capture.evidence_pack`, and `capture.doctor`. Inputs are already-exported records; it never fetches external systems. Portable calls reject `raw-local-only`.
