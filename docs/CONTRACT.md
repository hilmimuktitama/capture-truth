# Capture Truth Contract

This document is normative for schema `0.3.0`. When examples or prose disagree with this contract, this contract wins.

## Source

A source is the captured representation of one input artifact or compact system record. It preserves identity, capture time, freshness, access caveats, raw local content, and a SHA-256 content hash. Capture does not establish that the source is correct.

Valid freshness values are `fresh`, `captured`, `stale`, `unknown`, and `fixture`. `captured_at` must be an ISO-8601 UTC timestamp and must not be materially in the future.

## Evidence item

An evidence item is a parsed line, row, table row, or JSON record. It preserves the closest available source locator and may contain structured fields. Evidence items are parsing results, not assertions and not truth.

## Candidate claim

A claim is an extracted candidate assertion derived from an evidence item. It must include a stable id, exact extracted text, source refs with locators, extraction time, classification, and polarity. Classification is navigational metadata only. It does not establish correctness, severity, ownership, or status.

## Reviewed fact

A claim becomes eligible for `confirmed_facts` only when a reviewer explicitly sets `review_status: "confirmed"` or the compatibility field `confirmed: true`. All other ordinary observations remain `candidate_facts`. Capture and keyword classification never confirm a fact.

## Gap

A gap is a structural or source-quality problem, including missing or invalid metadata, stale input, duplicate identities, missing claims, dangling provenance, or unsupported schema versions. Gaps remain visible until the underlying pack is repaired.

## Conflict

A conflict is a candidate reconciliation task produced only when comparable predicates disagree. Version 0.3 recognizes normalized positive/negative disagreement and differing dates for the same ticket and normalized date predicate. A conflict does not decide which source is correct.

## Export profiles

- `raw-local-only` contains full local evidence. It must not be treated as safe to publish.
- `internal-evidence-pack` removes raw bodies and cached exports and pattern-redacts sensitive derived strings.
- `repo-safe-summary` excludes bodies, evidence items, claims, and entities and sanitizes displayed metadata and conflict details.

Redaction is defense in depth. No pattern-based detector can guarantee that output contains no confidential information; a human must review publication-bound output.

## Determinism and derivation

Callers may inject a clock when creating or validating packs. Refinement must recompute entities, gaps, conflicts, diagnostics, and safe exports from the final updated claims. Derived values must never disagree within the same returned pack.
