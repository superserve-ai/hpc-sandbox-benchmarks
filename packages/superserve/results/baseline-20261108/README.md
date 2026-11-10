# Superserve full-load baseline (2026-11-08)

Superserve-only extracts of the 56 shards from the first full-load run (run ids `ss-<suite>`,
generated 2026-11-08 01:20–02:11 UTC, same template `d424a915-ab73-4cd2-823d-f6b9ea279354`). This run predates
`bun run bench:superserve`, so it has no manifest. Its sandboxes cloned the upstream producer at `f499e8ef8`, and memory ran at the same
time as the synthetic-system suites rather than alone. Mastra `test:core` has no value in these shards: the task
exited 1 on the live models.dev e2e test, which `fcd7043e4` excludes.
