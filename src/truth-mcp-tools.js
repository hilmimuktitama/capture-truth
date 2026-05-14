import { isTextResult, runTruthTool } from "./truth-tools.js";

const SOURCE_SCHEMA = {
  type: "object",
  required: ["content"],
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: ["text", "markdown", "csv", "json"] },
    path: { type: "string" },
    url: { type: "string" },
    key: { type: "string" },
    adapter: { type: "string" },
    captured_at: { type: "string" },
    freshness: { type: "string" },
    access_caveats: { type: "array", items: { type: "string" } },
    content: {
      oneOf: [{ type: "string" }, { type: "object" }, { type: "array" }]
    }
  }
};

const EVIDENCE_PACK_SCHEMA = {
  type: "object",
  required: ["kind", "sources", "claims"],
  additionalProperties: true
};

const TIMELINE_SCHEMA = {
  type: "object",
  required: ["kind", "items"],
  additionalProperties: true
};

export function listTruthTools() {
  return [
    {
      name: "capture.create",
      description: "Create a provenance-preserving evidence pack from source intake.",
      inputSchema: {
        type: "object",
        required: ["sources"],
        additionalProperties: false,
        properties: {
          sources: { type: "array", minItems: 1, items: SOURCE_SCHEMA },
          adapters: { type: "array", items: { type: "object", additionalProperties: true } },
          extraction_profile: { type: "string", default: "general" }
        }
      }
    },
    {
      name: "capture.validate",
      description: "Validate an evidence pack for metadata gaps and unresolved conflicts.",
      inputSchema: {
        type: "object",
        required: ["evidence_pack"],
        additionalProperties: false,
        properties: { evidence_pack: EVIDENCE_PACK_SCHEMA }
      }
    },
    {
      name: "capture.render",
      description: "Render an evidence pack with repo-safe, internal, or raw-local export profiles.",
      inputSchema: {
        type: "object",
        required: ["evidence_pack"],
        additionalProperties: false,
        properties: {
          evidence_pack: EVIDENCE_PACK_SCHEMA,
          format: { type: "string", enum: ["markdown", "json"], default: "markdown" },
          export_profile: {
            type: "string",
            enum: ["repo-safe-summary", "internal-evidence-pack", "raw-local-only"],
            default: "internal-evidence-pack"
          }
        }
      }
    },
    {
      name: "program.reconcile",
      description: "Create a standard program-status object from captured evidence.",
      inputSchema: {
        type: "object",
        required: ["evidence_pack"],
        additionalProperties: false,
        properties: { evidence_pack: EVIDENCE_PACK_SCHEMA }
      }
    },
    {
      name: "timeline.create",
      description: "Create a timeline with explicit exact, range, earliest, TBC, or conflicting date status.",
      inputSchema: {
        type: "object",
        required: ["items"],
        additionalProperties: false,
        properties: {
          items: { type: "array", items: { type: "object", additionalProperties: true } },
          source_refs: { type: "array", items: { type: "object", additionalProperties: true } }
        }
      }
    },
    {
      name: "timeline.validate",
      description: "Validate timeline unknowns, date status, and milestone blocking fields.",
      inputSchema: {
        type: "object",
        required: ["timeline"],
        additionalProperties: false,
        properties: { timeline: TIMELINE_SCHEMA }
      }
    },
    {
      name: "timeline.render",
      description: "Render a timeline as Markdown or JSON without inventing unknown dates.",
      inputSchema: {
        type: "object",
        required: ["timeline"],
        additionalProperties: false,
        properties: {
          timeline: TIMELINE_SCHEMA,
          format: { type: "string", enum: ["markdown", "json"], default: "markdown" }
        }
      }
    },
    {
      name: "benchmark.fixture",
      description: "Compare the same TPM case with truth-tools output versus without-tools output.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          case_id: { type: "string" },
          with_tools: { type: "object", additionalProperties: true },
          without_tools: { type: "object", additionalProperties: true }
        }
      }
    },
    {
      name: "truth_tools.doctor",
      description: "Smoke-test install, schema, render, and aggregate MCP availability.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          all: { type: "boolean", default: true }
        }
      }
    }
  ];
}

export function callTruthTool(name, args = {}) {
  const result = runTruthTool(name, args);
  return textContent(isTextResult(name) ? result : JSON.stringify(result, null, 2));
}

function textContent(text) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}
