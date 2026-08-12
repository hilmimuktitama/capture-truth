# Changelog

## 0.4.1

- Added serialization-safe, versioned candidate derivation metadata.
- Portable profiles now retain structured/metadata candidates but conservatively exclude raw-body and mixed candidates, including after JSON, CLI, filesystem, and MCP round trips.
- Added conservative derivation validation, source-linkage checks, raw/mixed portable exclusion, and allowlisted portable fields.

## 0.4.0

- Narrowed the package to provenance-preserving capture of already-exported material.
- Added evidence packs, capture-quality diagnostics, candidate dedupe, timestamp normalization, redaction, three export profiles, CLI, and read-only MCP tools.
