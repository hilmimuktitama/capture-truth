# Output modes

Capture a durable review pack first:

```sh
capture-truth capture --source export.json --out pack.json
```

Review candidates sequentially, preserving the previous decision each time:

```sh
capture-truth candidate-review --pack pack.json --candidate-id candidate-one \
  --decision approve-portable --reviewed-by "Declared reviewer" \
  --reviewed-at 2026-07-20T12:00:00Z --output-mode pack --out reviewed.json
capture-truth candidate-review --pack reviewed.json --candidate-id candidate-two \
  --decision reject --reviewed-by "Declared reviewer" \
  --reviewed-at 2026-07-20T12:01:00Z --output-mode pack --out reviewed.json
```

Export once the review pass is complete:

```sh
capture-truth export --pack reviewed.json --profile portable-summary
```

For a local-only export that may retain exact raw material, use the explicit
local profile:

```sh
capture-truth export --pack reviewed.json --profile raw-local-only
```

`both` returns the pack and its projection together. Reviewer attribution is
declared input, not an authenticated identity assertion.
