---
name: capture-truth
description: Evidence-first capture workflow for AI agents and operators. Use when collecting pasted notes, local files, exports, or read-only adapter outputs into neutral evidence packs with source refs, freshness, gaps, conflicts, and downstream handoff to program-truth or timeline-truth without inferring status or timeline truth.
---

# Capture Truth

Use this skill when the user needs source intake before analysis. The goal is to preserve evidence, not decide what it means.

## Operating Rules

1. Capture raw source identity before summarizing.
2. Preserve `source_refs` on every extracted claim.
3. Record `captured_at`, `freshness`, adapter, path/URL/key, and access caveats when available.
4. Separate facts captured from source text, extraction gaps, unresolved conflicts, and assumptions.
5. Do not infer status, timeline, ownership, dates, risk severity, or program truth.
6. Treat live systems as read-only unless the user explicitly asks for a write and approves the exact payload.
7. If a connector or adapter is unavailable, continue with pasted or local artifacts and state the confidence downgrade.

## Workflow

1. Inventory available sources: pasted text, local files, CSV/JSON exports, and read-only adapter outputs.
2. Prefer `create_evidence_pack` when the MCP server is available.
3. Run `validate_evidence_pack` before using the pack downstream.
4. Render Markdown for human review.
5. Hand the reviewed pack to `program-truth`, `timeline-truth`, or another downstream workflow only after source gaps are visible.

## Output Quality Bar

Every capture output should show:

- systems or files captured
- capture timestamp or explicit missing timestamp gap
- freshness label or missing freshness gap
- claims with `source_refs`
- unresolved conflicts without resolving them
- assumptions that are explicit and narrow

For detailed schema and examples, read `references/framework.md`.
