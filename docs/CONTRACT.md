# Capture contract

Version 0.4.1 captures exported records only. `createEvidencePack` returns `kind`, `schema_version`, `generated_at`, `sources`, `candidate_claims`, `diagnostics`, and `summary`. Every candidate claim has enumerable `derivation_version: "0.4.1"` and `source_material` (`raw_body`, `structured_fields`, `metadata`, or `mixed`). Portable profiles always exclude raw-body and mixed candidates; missing, unknown, forged, or source-inconsistent derivation metadata is invalid and excluded conservatively. MCP normalize responses are serialized without raw content.

Sources preserve `id`, `type`, URL/path, observation and source-update timestamps, owner, revision, content hash, locator, caveats, raw inclusion, and metadata. Candidate claims contain only text, optional `suggested_kind`, keyword classification, `unreviewed` status, and exact source references.

Diagnostics are capture-quality signals only. `error` blocks contract-quality use; `warning` requires attention; `info` records an intentional compatibility or privacy event. Diagnostics do not assess truth, publication, artifact quality, or health.

The three export profiles are repo-safe-summary, internal-evidence-pack, and raw-local-only. Portable profiles have an explicit allowlist and no raw bodies. See `schemas/` and `npm run contracts:verify`.
