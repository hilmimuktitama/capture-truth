# Migration to 0.5.0

0.5.0 aligns the bundled contract schemas with Truth Tools. Copy or regenerate source, source-ref, and candidate-claim artifacts using the canonical 0.5.0 schemas; runtime validation now rejects recursive raw-like keys and malformed nested values.

Use `createEvidencePack` and `candidate_claims`. Candidate claims require the enumerable 0.5.0 derivation marker (`derivation_version` and `source_material`). Replace any source fetch step with an exported JSON input. Use `normalizeJiraIssue` or `normalizeConfluencePage` only on records already fetched by your own process. Select an explicit export profile; raw-local-only cannot be portable.

Portable profiles retain claims derived from `structured_fields` and `metadata`. They always exclude `raw_body` and `mixed` claims, including after JSON/filesystem/MCP round trips. Legacy, forged, or source-inconsistent claims are diagnosed and excluded rather than guessed safe. Approval now validates every candidate, source reference, and unique source id in the full pack, so forged approvals fail immediately. MCP exposes the same candidate review helper as the CLI/API. URL sanitization covers source/ref paths, encoded and nested URLs, query parameters, and fragments.
