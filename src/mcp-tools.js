import { createEvidencePack, buildProfileExport, normalizeSourceRecord, reviewCandidateClaim } from "./capture.js";
import { assertSafeUrlSchemes, redactAllowlistedSource, redactDiagnostic } from "./redaction.js";
import { runDoctor } from "./doctor.js";

const sourceSchema = { type: "object", required: ["id"], additionalProperties: true, properties: { id: { type: "string" }, type: { type: "string" }, url: { type: "string" }, locator: { type: "string" }, access_caveats: { type: "array", items: { type: "string" } }, observed_at: { type: "string" }, metadata: { type: "object" }, fields: { type: "object" } } };
export function listCaptureTools() { return [
  { name: "capture.normalize", description: "Normalize an already-exported source record; never fetches.", inputSchema: { type: "object", required: ["source"], additionalProperties: false, properties: { source: sourceSchema } } },
  { name: "capture.evidence_pack", description: "Build a provenance-preserving evidence pack from already-exported sources.", inputSchema: { type: "object", required: ["sources"], additionalProperties: false, properties: { sources: { type: "array", items: sourceSchema }, profile: { type: "string", enum: ["portable-summary", "repo-safe-summary", "internal-evidence-pack", "raw-local-only"] } } } },
  { name: "capture.candidate_review", description: "Review one candidate using full-pack derivation and provenance validation.", inputSchema: { type: "object", required: ["pack", "candidateId", "decision", "reviewedBy", "reviewedAt"], additionalProperties: false, properties: { pack: { type: "object" }, candidateId: { type: "string" }, decision: { type: "string", enum: ["approve-portable", "reject"] }, reviewedBy: { type: "string" }, reviewedAt: { type: "string" }, profile: { type: "string", enum: ["portable-summary", "repo-safe-summary", "internal-evidence-pack"] } } } },
  { name: "capture.doctor", description: "Check the installed capture-truth package.", inputSchema: { type: "object", additionalProperties: false, properties: {} } }
]; }
export async function callCaptureTool(name, args = {}) {
  if (name === "capture.normalize") {
    assertSafeUrlSchemes(args.source);
    const diagnostics = [];
    const normalized = normalizeSourceRecord(args.source, { diagnostics });
    const redaction = { changed: false };
    const portable = redactAllowlistedSource(normalized, redaction, false, true);
    if (redaction.changed) diagnostics.push({ type: "redaction_applied", severity: "info", message: "Pattern redaction changed portable output." });
    return jsonContent({ ...portable, raw_included: false, diagnostics: diagnostics.map((entry) => redactDiagnostic(entry, redaction)) });
  }
  if (name === "capture.evidence_pack") {
    if (args.profile === "raw-local-only") throw new Error("raw-local-only is local-only and is not available through portable MCP.");
    const pack = createEvidencePack({ sources: args.sources });
    return jsonContent(buildProfileExport(pack, args.profile ?? "internal-evidence-pack"));
  }
  if (name === "capture.candidate_review") {
    const reviewed = reviewCandidateClaim(args.pack, { candidateId: args.candidateId, decision: args.decision, reviewedBy: args.reviewedBy, reviewedAt: args.reviewedAt });
    return jsonContent(buildProfileExport(reviewed, args.profile ?? "portable-summary"));
  }
  if (name === "capture.doctor") return jsonContent(await runDoctor());
  throw new Error(`Unknown capture tool: ${name}`);
}
function jsonContent(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }; }
