// Superserve tested at the vendor seam: the adapter's translation over a stub SDK account, the port
// contract, and sessions through the package's own module. Kit behaviour (convergence, deadlines,
// the inventory partition, recovery mechanics) is tested once in the driver package.

import { describe, expect, test } from "bun:test";
import type { CreateRequest, DriverContext } from "@sandbox-benchmarks/driver";
import { launchDetached, readTextFile } from "@sandbox-benchmarks/driver";
import { MARKER_PREFIX } from "@sandbox-benchmarks/driver/vendor";
import { sdkStub, vendorContract, vendorDriver } from "@sandbox-benchmarks/driver/vendor/testing";
import type { SandboxCreateOptions, SandboxListOptions } from "@superserve/sdk";
import { superserveArtifactBuilder } from "./artifact.ts";
import superserve, { SUPERSERVE_SANDBOX_ID } from "./index.ts";
import type { SuperserveSdk } from "./vendor.ts";
import { SUPERSERVE_EXEC_TIMEOUT_MS, SUPERSERVE_MARKER_KEY, superserveVendor } from "./vendor.ts";

const KEY = "ss_live_sentinel-credential";
const context: DriverContext<"superserve"> = {
	env: { SUPERSERVE_API_KEY: KEY },
	artifact: { kind: "baked" },
	resolvedArtifact: { kind: "baked", ref: "toolchain-test" },
};
const request: CreateRequest = {
	spec: { vcpus: 4, memoryGb: 8, diskGb: 40 },
	artifact: context.resolvedArtifact,
	deadlineMs: 300_000,
};

class NotFoundError extends Error {}
class AuthenticationError extends Error {}
class ValidationError extends Error {}
class RateLimitError extends Error {}

type Row = {
	readonly id: string;
	name: string;
	status: string;
	metadata: Record<string, string>;
	vcpuCount: number;
	memoryMib: number;
};

/**
 * A whole Superserve account: a create returns an active sandbox, kill deletes it, and a listing
 * filters by status and by exact metadata the way the API does.
 */
function superserveAccount() {
	const calls: Array<{ name: string; options?: unknown }> = [];
	const account = sdkStub<SuperserveSdk, Row>(
		({ rows, add, row, run, files }) => {
			const handle = (id: string) => ({
				get id() {
					return row(id).id;
				},
				get name() {
					return row(id).name;
				},
				get status() {
					return row(id).status;
				},
				commands: {
					run: async (command: string, options?: Record<string, unknown>) => {
						calls.push({ name: "commands.run", options });
						return { ...run(id, command), truncated: false };
					},
				},
				files: {
					readText: async (path: string) => {
						calls.push({ name: "files.readText" });
						const text = files(id).get(path);
						if (text === undefined) throw new NotFoundError(path);
						return text;
					},
					write: async (path: string, text: string) => {
						calls.push({ name: "files.write" });
						files(id).set(path, text);
					},
				},
			});
			return {
				Sandbox: {
					create: async (options: SandboxCreateOptions) => {
						calls.push({ name: "create", options });
						const { id } = add({
							name: options.name,
							status: "active",
							metadata: { ...options.metadata },
							vcpuCount: 4,
							memoryMib: 8192,
						});
						return handle(id);
					},
					list: async (options: SandboxListOptions = {}) => {
						calls.push({ name: "list", options });
						const statuses = [options.status ?? []].flat();
						return [...rows.values()].filter(
							(sandbox) =>
								(statuses.length === 0 || statuses.includes(sandbox.status as never)) &&
								Object.entries(options.metadata ?? {}).every(
									([key, value]) => sandbox.metadata[key] === value,
								),
						);
					},
					killById: async (id: string, options?: unknown) => {
						calls.push({ name: "killById", options });
						const found = rows.get(id);
						if (found) found.status = "deleted";
					},
				},
				NotFoundError,
				AuthenticationError,
				ValidationError,
				RateLimitError,
			};
		},
		{ newId: () => crypto.randomUUID(), diskGb: 40 },
	);
	return { ...account, calls };
}

function driverOver(stub: ReturnType<typeof superserveAccount>) {
	return vendorDriver(superserve, context, {
		vendor: superserveVendor(stub.sdk, context),
		timing: { pollMs: 0, readyTimeoutMs: 500, deleteTimeoutMs: 500 },
	});
}

vendorContract("superserve adapter", superserve, () =>
	superserveVendor(superserveAccount().sdk, context),
);

describe("Superserve end to end through its module", () => {
	test("a session execs, serves files, launches detached, inventories, and is destroyed", async () => {
		const stub = superserveAccount();
		const foreign = stub.add({
			name: "other",
			status: "active",
			metadata: {},
			vcpuCount: 2,
			memoryMib: 2048,
		});
		const driver = driverOver(stub);
		const session = await driver.create(request);
		expect(SUPERSERVE_SANDBOX_ID.allows(session.sandboxRef.id)).toBe(true);

		const seven = await session.exec("sh -c 'exit 7'");
		expect(seven.exit).toEqual({ kind: "exited", code: 7 });
		await session.files?.writeText("/tmp/item", "saved");
		expect(await session.files?.exists("/tmp/item")).toBe(true);
		expect(await session.files?.readFile("/tmp/item")).toBe("saved");
		await launchDetached(session, "sh -c 'echo done > /tmp/done'");
		expect(await readTextFile(session, "/tmp/done")).toBe("done\n");

		// A paused benchmark sandbox holds no compute but still owns the sandbox: it is torn down.
		const paused = stub.add({
			name: "paused",
			status: "paused",
			metadata: { [SUPERSERVE_MARKER_KEY]: `${MARKER_PREFIX}paused` },
			vcpuCount: 4,
			memoryMib: 8192,
		}).id;
		expect(await driver.inventory?.list()).toEqual({
			owned: [session.sandboxRef, { provider: "superserve", id: paused }],
			foreignCount: 1,
		});
		await driver.destroyById?.({ provider: "superserve", id: paused });
		await session.destroy();
		expect(await driver.probes?.observe(session.sandboxRef)).toEqual({ state: "absent" });
		expect(await driver.inventory?.list()).toEqual({ owned: [], foreignCount: 1 });
		expect(stub.rows.get(foreign.id)?.status).toBe("active");

		// The template and marker reach the create; the key rides only the SDK's apiKey option.
		const create = stub.calls.find((call) => call.name === "create")?.options;
		expect(create).toMatchObject({
			apiKey: KEY,
			fromTemplate: "toolchain-test",
			timeoutSeconds: 3 * 60 * 60,
		});
		expect(create).not.toHaveProperty("envVars");
		for (const call of stub.calls.filter((call) => call.name === "commands.run")) {
			expect(JSON.stringify(call.options)).not.toContain(KEY);
		}
		// Every foreground command states its own bound instead of the server's 30s default.
		const execs = stub.calls.filter((call) => call.name === "commands.run");
		expect(
			execs.some(
				(call) =>
					(call.options as { timeoutMs?: number })?.timeoutMs === SUPERSERVE_EXEC_TIMEOUT_MS,
			),
		).toBe(true);
		expect(
			execs.every((call) => (call.options as { timeoutMs?: number })?.timeoutMs !== undefined),
		).toBe(true);
	});

	test("truncated output without a requested cap fails the command", async () => {
		const stub = superserveAccount();
		const vendor = superserveVendor(stub.sdk, context);
		const native = {
			commands: { run: async () => ({ stdout: "x", stderr: "", exitCode: 0, truncated: true }) },
		} as never;
		await expect(vendor.data.exec(native, "yes")).rejects.toThrow("truncated");
		expect(await vendor.data.exec(native, "yes", { maxOutputBytes: 1 })).toEqual({
			exitCode: 0,
			stdout: "x",
			stderr: "",
		});
	});

	test("auth, validation and rate-limit errors are refusals; only rate limits retry", () => {
		const { control } = superserveVendor(superserveAccount().sdk, context);
		expect(control.refused?.(new AuthenticationError())).toEqual({ retryable: false });
		expect(control.refused?.(new ValidationError())).toEqual({ retryable: false });
		expect(control.refused?.(new RateLimitError())).toEqual({ retryable: true });
		expect(control.refused?.(new Error("socket hang up"))).toBeUndefined();
		expect(control.absent?.(new NotFoundError())).toBe(true);
	});
});

describe("Superserve template builder", () => {
	const build = (existing: string[], replace: "allowed" | "forbidden") => {
		const calls: string[] = [];
		const Template = {
			list: async () => existing.map((name, index) => ({ id: `t-${index}`, name })),
			deleteById: async (id: string) => {
				calls.push(`delete ${id}`);
			},
			create: async (options: Record<string, unknown>) => {
				calls.push(`create ${JSON.stringify(options)}`);
				return {
					waitUntilReady: async () => ({ id: "t-new", status: "ready" }),
				};
			},
		};
		const builder = superserveArtifactBuilder(async () => ({ Template }) as never);
		const result = builder.build({
			name: "sandbox-benchmarks-toolchain-v8",
			spec: { vcpus: 4, memoryGb: 8, diskGb: 40 },
			env: { SUPERSERVE_API_KEY: KEY },
			replace,
			log: () => {},
			signal: new AbortController().signal,
			bakes: "oci",
			base: { digestRef: "ghcr.io/example/toolchain@sha256:abc" },
			imagesDir: "/images",
			dockerConfig: "/docker",
		});
		return { calls, result };
	};

	test("a new name is created at the target size from the pinned base", async () => {
		const { calls, result } = build(["sandbox-benchmarks-toolchain-v8-candidate"], "forbidden");
		expect(await result).toEqual({ ref: "sandbox-benchmarks-toolchain-v8", replaced: "none" });
		expect(calls).toHaveLength(1);
		expect(JSON.parse(calls[0]?.slice("create ".length) ?? "")).toMatchObject({
			name: "sandbox-benchmarks-toolchain-v8",
			from: "ghcr.io/example/toolchain@sha256:abc",
			vcpu: 4,
			memoryMib: 8192,
			diskMib: 40960,
		});
	});

	test("an existing name is replaced destructively, or refused before any delete", async () => {
		const allowed = build(["sandbox-benchmarks-toolchain-v8"], "allowed");
		expect(await allowed.result).toMatchObject({ replaced: "destructive" });
		expect(allowed.calls[0]).toBe("delete t-0");

		const forbidden = build(["sandbox-benchmarks-toolchain-v8"], "forbidden");
		await expect(forbidden.result).rejects.toThrow("may not be replaced");
		expect(forbidden.calls).toEqual([]);
	});
});
