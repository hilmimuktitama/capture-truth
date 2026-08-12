# Migration to 0.4.1

Use `createEvidencePack` and `candidate_claims`. Candidate claims now require the enumerable 0.4.1 derivation marker (`derivation_version` and `source_material`). Replace any source fetch step with an exported JSON input. Use `normalizeJiraIssue` or `normalizeConfluencePage` only on records already fetched by your own process. Select an explicit export profile; raw-local-only cannot be portable.

Portable profiles retain claims derived from `structured_fields` and `metadata`. They always exclude `raw_body` and `mixed` claims, including after JSON/filesystem/MCP round trips. Legacy, forged, or source-inconsistent claims are diagnosed and excluded rather than guessed safe. MCP normalize remains available as a local normalization utility, but its serialized response never includes raw content.
