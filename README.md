# Capture Truth

Capture Truth converts already-exported operational material into a provenance-preserving evidence pack. It does not determine truth.

Truth Tools is an evidence-first technical-program reliability toolkit combining provenance-preserving evidence intake, defensible timeline compilation, agent-guided status synthesis, and deterministic pre-publication review.

## One minute

```sh
npm install capture-truth
capture-truth capture --source export.json
```

Input is JSON containing a source or `sources` array. The default `capture` profile is `internal-evidence-pack`: it emits reviewable sources plus unreviewed structured/metadata candidates, diagnostics, and a summary. Raw and mixed candidates are excluded. Candidate claims are keyword suggestions, never facts or final claims. Use `--profile portable-summary` explicitly only after review for publication.

It has no Jira or Confluence fetcher. `normalizeJiraIssue` and `normalizeConfluencePage` are honest already-fetched normalizers. They never contact those services.

Profiles are `portable-summary` (approved structured/metadata candidates only), `internal-evidence-pack` (valid unreviewed structured/metadata candidates), and `raw-local-only` (valid all material locally and refuses portable output). `repo-safe-summary` is a deprecated alias that emits `deprecated_repo_safe_summary` and the same safe output. Every candidate claim carries enumerable `derivation_version: "0.5.0"` and a canonical `source_material` (`raw_body`, `structured_fields`, `metadata`, or `mixed`). Review records are non-authenticated attribution and never alter derivation or source material. Portable profiles validate source matches, redaction, and size, omitting everything else with diagnostics and counts.

CLI commands are `capture`, `candidate-review`, `doctor`, and `--help`. The read-only MCP server exposes `capture.normalize`, `capture.evidence_pack`, `capture.candidate_review`, and `capture.doctor`; candidate review uses the same full-pack validation helper as the API and CLI. MCP callers should select `internal-evidence-pack` when they need unreviewed review material and `portable-summary` only for approved publication.

Limitations: capture does not fetch, determine truth, create reviewed facts, assess health, or provide semantic proof. Raw material should not be placed in repository fixtures or reports.

Release status: 0.5.0, Node 22+, minimal runtime dependencies. Raw-local-only is intentionally local behavior: never commit or share its output.
