# @sandbox-benchmarks/superserve

Owns the Superserve driver implementation, template builder, SDK dependency, and
behavioral tests. The fleet loader selects this package lazily; shared session
mechanics live in `@sandbox-benchmarks/driver`. The SDK version is pinned in the
root catalog.

Quirks the driver is built around:

- A command without an explicit `timeoutMs` is ended by the server at 30 s, so
  every foreground command states its own bound.
- `Sandbox.connect` resumes a paused sandbox, so lookups read the account
  listing instead.
- A template cannot be rebuilt in place from a new base image, so replacing a
  template name deletes it first (`replaced: "destructive"`).

Run `bun run --filter @sandbox-benchmarks/superserve test` or `typecheck` from the repo root.

## Benchmark runner

`bun run bench:superserve <mode>` runs the suites on Superserve from one command
(`src/bench/run.ts`; `--help` lists the options). The in-sandbox producer is
cloned from this checkout's origin at HEAD, so commit and push first.

| Command | Load |
| --- | --- |
| `bun run bench:superserve full` | Waves synthetic-memory, synthetic-system, realworld in order; every suite of a wave at once at its default replicate count (peak 36 sandboxes). |
| `bun run bench:superserve low` | One suite at a time, 3 replicate sandboxes. |
| `bun run bench:superserve area <area> [--load low]` | Only the suites for one cause area: `egress`, `cpu-contention`, `cpu-clock`, `memory-bandwidth`, `disk`, `routing`. Default load is full. |
| `bun run bench:superserve smoke <suite>` | One suite, one replicate. |

Shards go to `data/runs/<runId>-<suite>-r<i>.json`. `data/raw/<runId>/manifest.json`
records the plan, the git SHA and repository, the template (id and size), a
guest probe (CPU model and clock, kernel, resolver, egress address, edge
location), each sandbox's observed specs, and producer changes on this branch.
Set `SUPERSERVE_REGION` to record the declared region. Marked sandboxes that are
still alive when the run ends are killed.
