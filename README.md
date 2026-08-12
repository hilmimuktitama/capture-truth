# Capture Truth

Capture Truth converts already-exported operational material into a provenance-preserving evidence pack. It does not determine truth.

## One minute

```sh
npm install capture-truth
capture-truth capture --source export.json --profile repo-safe-summary
```

Input is JSON containing a source or `sources` array. The result contains normalized sources, `candidate_claims`, capture-quality diagnostics, and a summary. Candidate claims are keyword suggestions and always `unreviewed`; they are never facts or final claims.

It has no Jira or Confluence fetcher. `normalizeJiraIssue` and `normalizeConfluencePage` are honest already-fetched normalizers. They never contact those services.

Profiles are `repo-safe-summary` (portable allowlist, no raw), `internal-evidence-pack` (portable normalized metadata, claims, diagnostics, no raw), and `raw-local-only` (raw is permitted locally and refuses portable output). Every candidate claim carries enumerable `derivation_version: "0.4.1"` and a canonical `source_material` (`raw_body`, `structured_fields`, `metadata`, or `mixed`), so privacy filtering survives JSON, filesystem, CLI, and MCP serialization. Portable profiles always exclude `raw_body` and `mixed` claims, and reject missing or source-inconsistent derivation metadata. Redaction covers URLs, paths, locators, keys, metadata, and caveats; pattern redaction is defense-in-depth, not a guarantee. The local normalize utility may inspect supplied raw input, while MCP normalize responses remove raw content.

CLI commands are `capture`, `doctor`, and `--help`. The read-only MCP server exposes `capture.normalize`, `capture.evidence_pack`, and `capture.doctor`.

Limitations: capture does not fetch, determine truth, create reviewed facts, assess health, or provide semantic proof. Raw material should not be placed in repository fixtures or reports.

Release status: 0.4.1, Node 22+, minimal runtime dependencies. Raw-local-only is intentionally local behavior: never commit or share its output.
