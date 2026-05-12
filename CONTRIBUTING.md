# Contributing

Thanks for helping improve Capture Truth.

This project is a local-first evidence intake package for agent workflows. It should stay small, deterministic, and strict about provenance.

## Good Contributions

- Better extraction for pasted notes, Markdown, CSV, or JSON.
- Stronger validation for source refs, capture metadata, stale sources, and conflicts.
- Read-only adapter examples that preserve raw source identity.
- Fixtures that represent real TPM/operator source intake.
- Documentation that helps users install, run, or evaluate the MCP server.

## Out Of Scope

- Status, risk, or timeline truth decisions.
- Writes to Jira, Confluence, Notion, or other external systems.
- Hosted credential storage.
- Full knowledge-base or memory management.
- Silent inference of dates, owners, status, or confidence.

## Development

```bash
npm install
npm test
npm run check
npm pack --dry-run
```

## Pull Request Checklist

- Preserve `source_refs` when transforming source material.
- Report uncertainty as gaps, conflicts, or assumptions.
- Keep adapters read-only unless the project explicitly changes scope.
- Add or update tests for behavior changes.
- Run `npm test`, `npm run check`, and `npm pack --dry-run`.
