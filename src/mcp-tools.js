import {
  createEvidencePack,
  refineEvidencePack,
  renderEvidencePack,
  validateEvidencePack
} from "./evidence-pack.js";
import { runBenchmarkFixture } from "./benchmark.js";

export const SOURCE_SCHEMA = {
  type: "object",
  required: ["id", "content"],
  additionalProperties: true,
  properties: {
    id: { type: "string", minLength: 1, maxLength: 256, description: "Stable source identifier used in source_refs." },
    type: { type: "string", enum: ["text", "markdown", "csv", "json"], default: "text" },
    path: { type: "string", description: "Optional local path preserved as source metadata." },
    url: { type: "string", description: "Optional URL preserved as source metadata." },
    key: { type: "string", description: "Optional system key, such as a ticket or page id." },
    adapter: { type: "string", description: "Read-only adapter that produced the source." },
    captured_at: { type: "string", format: "date-time", description: "Capture timestamp in ISO-8601 form." },
    freshness: { type: "string", enum: ["fresh", "captured", "stale", "unknown", "fixture"] },
    access_caveats: { type: "array", maxItems: 100, items: { type: "string", maxLength: 2000 } },
    content: {
      description: "Pasted text/file content. JSON sources may pass a JSON string or object.",
      oneOf: [{ type: "string", maxLength: 5000000 }, { type: "object" }, { type: "array", maxItems: 10000 }]
    }
  }
};

const SOURCE_REF_SCHEMA = {
  type: "object",
  required: ["source_id", "locator"],
  additionalProperties: false,
  properties: {
    source_id: { type: "string", minLength: 1 },
    locator: { type: "string", minLength: 1 }
  }
};

const CLAIM_SCHEMA = {
  type: "object",
  required: ["id", "text", "classification", "source_refs"],
  additionalProperties: true,
  properties: {
    id: { type: "string", minLength: 1 },
    text: { type: "string", minLength: 1, maxLength: 100000 },
    classification: { type: "string", enum: ["observation", "blocker", "risk", "decision", "action"] },
    polarity: { type: "string", enum: ["positive", "negative"] },
    review_status: { type: "string", enum: ["unreviewed", "confirmed", "rejected"] },
    source_refs: { type: "array", minItems: 1, maxItems: 100, items: SOURCE_REF_SCHEMA }
  }
};

export const EVIDENCE_PACK_SCHEMA = {
  type: "object",
  required: ["kind", "schema_version", "sources", "claims"],
  additionalProperties: true,
  properties: {
    kind: { type: "string", enum: ["evidence_pack"] },
    schema_version: { type: "string", enum: ["0.3.0"] },
    sources: { type: "array", maxItems: 1000, items: SOURCE_SCHEMA },
    claims: { type: "array", maxItems: 50000, items: CLAIM_SCHEMA },
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
            maxItems: 1000,
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
