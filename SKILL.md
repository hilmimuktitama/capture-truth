---
name: capture-truth
description: Convert already-exported operational material into provenance-preserving evidence packs.
---

Use `createEvidencePack({ sources, now })`. Preserve source identity, observation and update timestamps, revision, hash, locator, owner, caveats, metadata, and raw inclusion state. Candidate claims use keyword classification and remain unreviewed.

Never fetch Jira or Confluence, infer truth, promote facts, or imply semantic validation. Use a fixed clock in deterministic tests. Portable profiles must be treated as allowlisted metadata-only outputs; raw-local-only is never portable.
