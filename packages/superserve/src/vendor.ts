// Superserve's vendor adapter over the loaded @superserve/sdk, which it receives and never loads.
// Readiness, cleanup confirmation, recovery, inventory and the disk proof live in the driver kit
// (`@sandbox-benchmarks/driver/vendor`).
//
// The account key rides only the SDK's `apiKey` option. Every SDK call takes the caller's signal.
// A sandbox is read by listing, never by `Sandbox.connect`, which resumes a paused sandbox.

import type { DriverContext, ExecOptions } from "@sandbox-benchmarks/driver";
import type { Phase, Vendor, VendorRecord } from "@sandbox-benchmarks/driver/vendor";
import { instanceOfAny, LEAK_EXPIRY_MS } from "@sandbox-benchmarks/driver/vendor";
import type { Sandbox, SandboxInfo, SandboxStatus } from "@superserve/sdk";
import { type } from "arktype";

/** The SDK surface the adapter translates; the package entry passes the loaded module. */
export type SuperserveSdk = Pick<
	typeof import("@superserve/sdk"),
	"Sandbox" | "NotFoundError" | "AuthenticationError" | "ValidationError" | "RateLimitError"
>;

export const SUPERSERVE_SANDBOX_ID = type("string.uuid");

/** The metadata key a create stamps its ownership marker under. */
export const SUPERSERVE_MARKER_KEY = "sandbox-benchmarks-attempt";

/**
 * The server ends a command at 30s unless the request states its own bound. The harness routes
 * every step past its sync cap through a detached shell, so this only has to outlast that cap.
 */
export const SUPERSERVE_EXEC_TIMEOUT_MS = 600_000;

/** Every status that still owns resources: inventory and lookups skip `deleted`. */
const LIVE: readonly SandboxStatus[] = [
	"starting",
	"active",
	"pausing",
	"paused",
	"resuming",
	"migrating",
	"failed",
];

/** One sandbox row; a create's row also carries the native handle it returned. */
export type SuperserveRow = Pick<SandboxInfo, "id" | "name" | "status" | "metadata"> &
	Partial<Pick<SandboxInfo, "vcpuCount" | "memoryMib">> & { readonly native?: Sandbox };

/**
 * `active` is the only usable state. A pause holds no compute but still owns the sandbox, so it is
 * deleted like a failure; a state this adapter does not know is read as failed for the same reason.
 */
function phaseOf(status: string): Phase {
	switch (status) {
		case "active":
			return "ready";
		case "starting":
		case "resuming":
		case "migrating":
			return "pending";
		case "deleted":
			return "gone";
		default:
			return "failed";
	}
}

const record = (row: SuperserveRow): VendorRecord<SuperserveRow> => {
	const marker = row.metadata[SUPERSERVE_MARKER_KEY];
	return {
		id: row.id,
		phase: phaseOf(row.status),
		...(marker && { marker }),
		...((row.status === "paused" || row.status === "pausing") && { stopped: true }),
		raw: row,
	};
};

export const superserveVendor = (
	sdk: SuperserveSdk,
	{ env, resolvedArtifact }: Pick<DriverContext<"superserve">, "env" | "resolvedArtifact">,
): Vendor<SuperserveRow, Sandbox> => {
	const apiKey = env.SUPERSERVE_API_KEY;
	const refusal = instanceOfAny(sdk.AuthenticationError, sdk.ValidationError, sdk.RateLimitError);
	const rateLimited = instanceOfAny(sdk.RateLimitError);
	const list = async (signal: AbortSignal, metadata?: Record<string, string>) =>
		(await sdk.Sandbox.list({ apiKey, signal, status: LIVE, ...(metadata && { metadata }) })).map(
			record,
		);

	return {
		control: {
			// Create returns once the VM is booted; its status proves readiness.
			create: async ({ marker }, { signal }) => {
				const metadata = { [SUPERSERVE_MARKER_KEY]: marker };
				const native = await sdk.Sandbox.create({
					apiKey,
					signal,
					name: marker,
					fromTemplate: resolvedArtifact.ref,
					timeoutSeconds: LEAK_EXPIRY_MS / 1000,
					metadata,
				});
				return record({
					id: native.id,
					name: native.name,
					status: native.status,
					metadata,
					native,
				});
			},
			get: async (id, { signal }) => (await list(signal)).find((row) => row.id === id) ?? null,
			// killById resolves once the sandbox is destroyed and no-ops on an unknown id.
			remove: async (id, { signal }) => {
				await sdk.Sandbox.killById(id, { apiKey, signal });
				return "removed";
			},
			absent: instanceOfAny(sdk.NotFoundError),
			// The list endpoint returns the whole account in one response.
			page: async (_cursor, { signal }) => ({ records: await list(signal) }),
			// A server-side metadata query; the kit still rejects any row another attempt owns.
			find: async (marker, _cursor, { signal }) => ({
				records: await list(signal, { [SUPERSERVE_MARKER_KEY]: marker }),
			}),
			refused: (error) => (refusal(error) ? { retryable: rateLimited(error) } : undefined),
		},
		data: {
			attach: ({ raw }) => {
				if (!raw.native)
					throw new Error("Superserve attaches only the sandbox its create returned");
				return raw.native;
			},
			exec: async (native, command, options?: ExecOptions) => {
				const result = await native.commands.run(command, {
					timeoutMs: SUPERSERVE_EXEC_TIMEOUT_MS,
					...(options?.signal && { signal: options.signal }),
					...(options?.maxOutputBytes !== undefined && { maxOutputBytes: options.maxOutputBytes }),
				});
				// Output cut short without a requested cap is not a result the harness can trust.
				if (result.truncated && options?.maxOutputBytes === undefined)
					throw new Error(`Superserve truncated the output of: ${command.slice(0, 120)}`);
				return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
			},
			files: {
				read: (native, path) => native.files.readText(path),
				write: (native, path, text) => native.files.write(path, text),
				exists: async (native, path) => {
					const result = await native.commands.run(`test -e '${path.replaceAll("'", `'\\''`)}'`, {
						timeoutMs: 30_000,
					});
					return result.exitCode === 0;
				},
			},
		},
	};
};
