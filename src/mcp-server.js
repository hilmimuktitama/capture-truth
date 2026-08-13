#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { callCaptureTool, listCaptureTools } from "./mcp-tools.js";

const server = new Server(
  {
    name: "capture-truth",
    version: "0.5.1"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listCaptureTools()
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await callCaptureTool(request.params.name, request.params.arguments ?? {});
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
});

await server.connect(new StdioServerTransport());
