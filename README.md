# Capture Truth

Capture Truth converts already-exported operational material into a provenance-preserving evidence pack. It does not determine truth.

Truth Tools is an evidence-first technical-program reliability toolkit combining provenance-preserving evidence intake, defensible timeline compilation, agent-guided status synthesis, and deterministic pre-publication review.

## One minute

```sh
npm install capture-truth
capture-truth capture --source export.json
```

Input is JSON containing a source or `sources` array. `capture` defaults to output mode `pack`, preserving the review surface. Use `--output-mode export` or `both` to request a projection; `--profile` is accepted only when an export is requested. `export --pack reviewed-pack.json` is a separate projection command. Raw and mixed candidates are excluded from portable projections. Candidate claims are keyword suggestions, never facts or final claims. Review attribution is declared by the caller and is not authenticated.

It has no Jira or Confluence fetcher. `normalizeJiraIssue` and `normalizeConfluencePage` are honest already-fetched normalizers. They never contact those services.

Profiles are `portable-summary` (approved structured/metadata candidates only), `internal-evidence-pack` (valid unreviewed structured/metadata candidates), and `raw-local-only` (valid all material locally and refuses portable output). `repo-safe-summary` is a deprecated alias that emits `deprecated_repo_safe_summary` and the same safe output. Every candidate claim carries enumerable `derivation_version: "0.5.1"` and a canonical `source_material` (`raw_body`, `structured_fields`, `metadata`, or `mixed`). Portable profiles validate source matches, redaction, and size, omitting everything else with diagnostics and counts. Rejected candidates are always excluded from exports.

CLI commands are `capture`, `export`, `candidate-review`, `doctor`, and `--help`. `export` requires `--profile`; CLI raw-local-only exports are explicitly local projections and may include raw material. Candidate review can emit a reviewed pack (`--output-mode pack`), enabling a sequential two-or-more-candidate review flow before one final export. With no output mode, candidate review preserves the historical portable-summary export response; explicit `export` or `both` requires `--profile`. The `both` response is exactly `{ reviewed_pack, export }`. The read-only MCP server exposes `capture.normalize`, `capture.evidence_pack`, `capture.export`, `capture.candidate_review`, and `capture.doctor`; `capture.export` accepts `pack` and required `profile` and returns the same projection as `buildProfileExport`. MCP rejects raw-local-only profiles. Candidate review uses the same full-pack validation helper as the API and CLI.

Limitations: capture does not fetch, determine truth, create reviewed facts, assess health, or provide semantic proof. Raw material should not be placed in repository fixtures or reports.

Release status: 0.5.1, Node 22+, minimal runtime dependencies. Raw-local-only is intentionally local behavior: never commit or share its output.
