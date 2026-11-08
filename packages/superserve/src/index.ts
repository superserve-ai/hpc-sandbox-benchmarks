// The Superserve DriverModule: the kit's driver over Superserve's adapter, bound to the real SDK
// here and nowhere else. Tests lower the same module over a stub SDK through `vendorDriver`.

import { defineVendorDriver, pinned } from "@sandbox-benchmarks/driver/vendor";
import * as sdk from "@superserve/sdk";
import { SUPERSERVE_PROVENANCE } from "./provenance.ts";
import { SUPERSERVE_MARKER_KEY, SUPERSERVE_SANDBOX_ID, superserveVendor } from "./vendor.ts";

export { SUPERSERVE_PROVENANCE, SUPERSERVE_SANDBOX_ID };

export default defineVendorDriver("superserve", {
	provenance: SUPERSERVE_PROVENANCE,
	sandboxId: SUPERSERVE_SANDBOX_ID,
	// The template pins 4 vCPU / 8 GiB and its disk; the guest's ext4 root reports the requested
	// disk minus filesystem metadata, so the proof allows 3% of the request.
	coverage: pinned(4, 8),
	diskProof: { allowanceRatio: 0.03 },
	// Commands budgeted at or past the 60s synchronous cap run in a detached shell and are polled.
	execution: { syncCapMs: 60_000, durable: "shell-detach" },
	markerKey: SUPERSERVE_MARKER_KEY,
	vendor: (context) => superserveVendor(sdk, context),
});
