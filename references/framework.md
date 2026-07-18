# Capture Truth Framework

This framework defines the v0.3 evidence intake contract behind `capture-truth`.

## Evidence Pack Shape

```json
{
  "kind": "evidence_pack",
  "schema_version": "0.3.0",
  "version": "0.3.0",
  "created_at": "2026-05-12T14:00:00Z",
  "extraction_profile": "general",
  "sources": [],
  "evidence_items": [],
  "claims": [],
  "entities": {},
  "gaps": [],
  "conflicts": [],
  "assumptions": [],
  "exports": {}
}
```

## Source Rules

Every source should preserve:

- stable `id`
- `type`: `text`, `markdown`, `csv`, or `json`
- `adapter`: `direct`, `local_file`, `fixture`, or another read-only adapter id
- one of `path`, `url`, or `key` when available
- `captured_at`
- `freshness`
- `access_caveats`
- raw `content`
- deterministic SHA-256 `content_hash`

## Claim Rules

Evidence items preserve parsed rows or lines. Claims are candidate atomic statements extracted from those items. Neither is final truth.

Every claim must include:

- stable `id`
- exact extracted `text`
- lightweight `classification`
- `source_refs`
- `extracted_at`
- `polarity`

Classification is a navigation aid only. It must not imply correctness.

Claims enter `confirmed_facts` only after a reviewer sets `review_status: "confirmed"` (or the compatibility field `confirmed: true`). Unreviewed observations remain `candidate_facts`.

## Gap Rules

Validation should report:

- `missing_captured_at`
- `missing_freshness`
- `duplicate_source_id`
- `stale_source`
- `access_caveat`
- `missing_source_refs`
- invalid or future capture timestamps
- unsupported freshness values
- duplicate claim ids
- dangling source refs and missing locators
- unsupported schema versions

Do not hide gaps to make output cleaner.

## Conflict Rules

Conflicts remain unresolved in v0. Show both claims and let downstream workflows reconcile them with source hierarchy and human review.

## Adapter Rules

Adapters are read-only and return source-shaped objects.

```js
{
  id: "adapter-id",
  type: "adapter-type",
  metadata: { read_only: true },
  capabilities: ["read"],
  read(input) {
    return {
      id: "source-id",
      type: "text",
      adapter: "adapter-type",
      captured_at: "2026-05-12T14:00:00Z",
      freshness: "captured",
      access_caveats: [],
      content: "raw source content"
    };
  }
}
```

## Downstream Handoff

Use `capture-truth` before:

- `program-truth`: when the next step is status, blocker, risk, dependency, or decision reconstruction.
- `timeline-truth`: when the next step is date, milestone, owner, or dependency timeline compilation.

The handoff should include the full local JSON pack plus a separately generated repo-safe render. Internal and repo-safe exports are sanitized derivatives and do not contain cached raw exports.
