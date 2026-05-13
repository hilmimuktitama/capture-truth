import {
  createEvidencePack,
  refineEvidencePack,
  renderEvidencePack,
  validateEvidencePack
} from "./evidence-pack.js";
import { runBenchmarkFixture } from "./benchmark.js";

const SOURCE_SCHEMA = {
  type: "object",
  required: ["content"],
  additionalProperties: true,
  properties: {
    id: { type: "string", description: "Stable source identifier used in source_refs." },
    type: { type: "string", enum: ["text", "markdown", "csv", "json"], default: "text" },
    path: { type: "string", description: "Optional local path preserved as source metadata." },
    url: { type: "string", description: "Optional URL preserved as source metadata." },
    key: { type: "string", description: "Optional system key, such as a ticket or page id." },
    adapter: { type: "string", description: "Read-only adapter that produced the source." },
    captured_at: { type: "string", description: "Capture timestamp in ISO-8601 form." },
    freshness: { type: "string", description: "Freshness label such as fresh, captured, stale, or unknown." },
    access_caveats: { type: "array", items: { type: "string" } },
    content: {
      description: "Pasted text/file content. JSON sources may pass a JSON string or object.",
      oneOf: [{ type: "string" }, { type: "object" }, { type: "array" }]
    }
  }
};

const EVIDENCE_PACK_SCHEMA = {
  type: "object",
  required: ["kind", "sources", "claims"],
  additionalProperties: true,
  properties: {
    kind: { type: "string", enum: ["evidence_pack"] },
    sources: { type: "array", items: { type: "object", additionalProperties: true } },
    claims: { type: "array", items: { type: "object", additionalProperties: true } },
    gaps: { type: "array", items: { type: "object", additionalProperties: true } },
    conflicts: { type: "array", items: { type: "object", additionalProperties: true } },
    assumptions: { type: "array", items: { type: "string" } }
  }
};

export function listCaptureTools() {
  return [
    {
      name: "create_evidence_pack",
      description:
        "Compile pasted, file, or adapter-produced sources into a neutral evidence pack with source refs, gaps, conflicts, and assumptions.",
      inputSchema: {
        type: "object",
        required: ["sources"],
        additionalProperties: false,
        properties: {
          sources: {
            type: "array",
            minItems: 1,
            items: SOURCE_SCHEMA
          },
          adapters: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Optional read-only adapter descriptors used for source metadata."
          },
          extraction_profile: {
            type: "string",
            default: "general",
            description: "Extraction profile label preserved on the pack; v0 remains neutral."
          }
        }
      }
    },
    {
      name: "validate_evidence_pack",
      description:
        "Validate a neutral evidence pack for missing source refs, missing capture metadata, stale sources, duplicate source ids, and unresolved conflicts.",
      inputSchema: {
        type: "object",
        required: ["evidence_pack"],
        additionalProperties: false,
        properties: {
          evidence_pack: EVIDENCE_PACK_SCHEMA
        }
      }
    },
    {
      name: "render_evidence_pack",
      description: "Render a neutral evidence pack as compact Markdown or JSON.",
      inputSchema: {
        type: "object",
        required: ["evidence_pack"],
        additionalProperties: false,
        properties: {
          evidence_pack: EVIDENCE_PACK_SCHEMA,
          format: {
            type: "string",
            enum: ["markdown", "json"],
            default: "markdown"
          },
          export_profile: {
            type: "string",
            enum: ["repo-safe-summary", "internal-evidence-pack", "raw-local-only"],
            description: "Optional safety profile. repo-safe-summary omits raw source bodies from Markdown."
          }
        }
      }
    },
    {
      name: "refine_evidence_pack",
      description:
        "Apply reviewer or agent edits to an evidence pack while preserving source_refs unless explicitly replaced.",
      inputSchema: {
        type: "object",
        required: ["evidence_pack", "updates"],
        additionalProperties: false,
        properties: {
          evidence_pack: EVIDENCE_PACK_SCHEMA,
          updates: {
            type: "array",
            items: {
              type: "object",
              required: ["set"],
              additionalProperties: false,
              properties: {
                matchId: { type: "string" },
                matchText: { type: "string" },
                set: { type: "object", additionalProperties: true }
              }
            }
          }
        }
      }
    },
    {
      name: "run_capture_benchmark_fixture",
      description:
        "Run the deterministic capture-truth benchmark fixture covering stale sources, date conflicts, claim disagreement, repo-safe export, and redaction checks.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      }
    }
  ];
}

export function callCaptureTool(name, args = {}) {
  switch (name) {
    case "create_evidence_pack":
      return jsonContent(createEvidencePack(args));
    case "validate_evidence_pack":
      return jsonContent(validateEvidencePack(args.evidence_pack));
    case "render_evidence_pack":
      return textContent(renderEvidencePack(args.evidence_pack, { format: args.format, export_profile: args.export_profile }));
    case "refine_evidence_pack":
      return jsonContent(refineEvidencePack(args.evidence_pack, { updates: args.updates }));
    case "run_capture_benchmark_fixture":
      return jsonContent(runBenchmarkFixture());
    default:
      throw new Error(`Unknown capture tool: ${name}`);
  }
}

function jsonContent(value) {
  return textContent(JSON.stringify(value, null, 2));
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
