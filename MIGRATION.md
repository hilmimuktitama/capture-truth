# Migration to 0.4.0

Use `createEvidencePack` and `candidate_claims`. Replace any source fetch step with an exported JSON input. Use `normalizeJiraIssue` or `normalizeConfluencePage` only on records already fetched by your own process. Select an explicit export profile; raw-local-only cannot be portable.
