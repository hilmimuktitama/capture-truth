import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP server lists and calls capture-truth tools over stdio", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/mcp-server.js"],
    cwd: process.cwd(),
    stderr: "pipe"
  });
  const client = new Client({ name: "capture-truth-smoke-test", version: "0.3.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.some((tool) => tool.name === "create_evidence_pack"), true);

    const result = await client.callTool({
      name: "create_evidence_pack",
      arguments: {
        sources: [
          {
            id: "mcp-smoke",
            type: "text",
            captured_at: "2026-05-12T14:00:00Z",
            freshness: "fresh",
            content: "Owner TPM captured MCP smoke evidence by 2026-05-13."
          }
        ]
      }
    });

    const pack = JSON.parse(result.content[0].text);
    assert.equal(pack.kind, "evidence_pack");
    assert.equal(pack.sources[0].id, "mcp-smoke");
  } finally {
    await client.close();
  }
});
