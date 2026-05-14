export function reconcileProgram({ evidence_pack: evidencePack } = {}) {
  if (!evidencePack || evidencePack.kind !== "evidence_pack") {
    throw new Error("program.reconcile requires an evidence_pack.");
  }

  const claims = evidencePack.claims ?? [];
  const conflicts = evidencePack.conflicts ?? [];

  return {
    kind: "program_status",
    version: "0.1.0",
    confirmed_facts: claims.filter(isConfirmedFact).map(statusItem),
    blockers: claims.filter(isBlocker).map(statusItem),
    risks: claims.filter(isRisk).map(statusItem),
    unknowns: collectUnknowns(evidencePack),
    conflicts,
    assumptions: [
      "Program status was reconciled from captured evidence only; no external source was queried by this command."
    ],
    recommended_write_back: {
      repo: [
        "Commit repo-safe summaries, status schema output, explicit unknowns, and conflict/action lists."
      ],
      local_only: [
        "Keep raw Jira/Confluence bodies, customer details, credentials, and internal evidence packs in .tmp or another ignored local path."
      ]
    }
  };
}

function isConfirmedFact(claim) {
  const text = claim.text.toLowerCase();
  return !isBlocker(claim) && !isRisk(claim) && !text.includes("unknown") && !text.includes("tbc");
}

function isBlocker(claim) {
  const text = claim.text.toLowerCase();
  return claim.classification === "blocker" || text.includes("blocked") || text.includes("blocker");
}

function isRisk(claim) {
  return claim.classification === "risk" || claim.text.toLowerCase().includes("risk");
}

function collectUnknowns(evidencePack) {
  const unknownClaims = (evidencePack.claims ?? [])
    .filter((claim) => /\b(tbc|unknown|missing|unconfirmed)\b/i.test(claim.text))
    .map(statusItem);
  const gaps = (evidencePack.gaps ?? []).map((gap) => ({
    id: gap.type,
    text: gap.message,
    source_refs: gap.source_id ? [{ source_id: gap.source_id }] : []
  }));
  return [...unknownClaims, ...gaps];
}

function statusItem(claim) {
  return {
    id: claim.id,
    text: claim.text,
    source_refs: claim.source_refs ?? []
  };
}
