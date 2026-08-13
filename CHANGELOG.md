# Changelog

## 0.5.1

- Added explicit `pack`, `export`, and `both` output modes, a separate export command, and `capture.export` MCP parity.
- Added sequential reviewed-pack workflows; rejected candidates remain excluded from exports.
- Candidate-review `both` now returns `{ reviewed_pack, export }`; omitted output mode retains the historical portable-summary export, while explicit exports require a profile.
- Corrected candidate contract wording to distinguish extracted suggestions from reviewed facts and documented declared, non-authenticated attribution.
- Locked package and derivation contract version to 0.5.1.

## 0.5.0

- Aligned candidate, source, and source-reference schemas with Truth Tools.
- Added recursive runtime shape/privacy validation and URL-aware sanitization for paths, locators, nested values, queries, fragments, and encoded URLs.
- Candidate approval now validates the complete pack and rejects forged, raw-body, and mixed approvals through API, CLI, and MCP.
- Added the MCP candidate review tool and portable-summary profile enum; MCP reported version 0.5.0.

## 0.4.1

- Added serialization-safe, versioned candidate derivation metadata.
- Portable profiles now retain structured/metadata candidates but conservatively exclude raw-body and mixed candidates, including after JSON, CLI, filesystem, and MCP round trips.
- Added conservative derivation validation, source-linkage checks, raw/mixed portable exclusion, and allowlisted portable fields.

## 0.4.0

- Narrowed the package to provenance-preserving capture of already-exported material.
- Added evidence packs, capture-quality diagnostics, candidate dedupe, timestamp normalization, redaction, three export profiles, CLI, and read-only MCP tools.
