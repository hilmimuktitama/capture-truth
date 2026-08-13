# Changelog

## 0.5.0

- Aligned candidate, source, and source-reference schemas with Truth Tools.
- Added recursive runtime shape/privacy validation and URL-aware sanitization for paths, locators, nested values, queries, fragments, and encoded URLs.
- Candidate approval now validates the complete pack and rejects forged, raw-body, and mixed approvals through API, CLI, and MCP.
- Added the MCP candidate review tool and portable-summary profile enum; MCP reports version 0.5.0.

## 0.4.1

- Added serialization-safe, versioned candidate derivation metadata.
- Portable profiles now retain structured/metadata candidates but conservatively exclude raw-body and mixed candidates, including after JSON, CLI, filesystem, and MCP round trips.
- Added conservative derivation validation, source-linkage checks, raw/mixed portable exclusion, and allowlisted portable fields.

## 0.4.0

- Narrowed the package to provenance-preserving capture of already-exported material.
- Added evidence packs, capture-quality diagnostics, candidate dedupe, timestamp normalization, redaction, three export profiles, CLI, and read-only MCP tools.
