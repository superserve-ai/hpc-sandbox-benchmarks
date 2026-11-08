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
