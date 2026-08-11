# Release process

Version 0.4.0 releases use a canonical `v0.4.0`-style tag. CI checks out the exact tag, verifies HEAD and package version, runs the full validation suite, and publishes with npm provenance. Permissions are contents read and id-token write; no token secret is required.
