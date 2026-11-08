import { defineProviderMeta } from "../provider-meta.ts";

export default defineProviderMeta("superserve", {
	displayName: "Superserve",
	vendor: "Superserve",
	website: "https://superserve.ai",
	sdkPackage: "@superserve/sdk",
	artifact: { kind: "baked" },
	inputs: ["SUPERSERVE_API_KEY"],
	isolation: {
		class: "microVM",
		technology: "Firecracker microVM",
	},
	pricing: {
		model: "published",
		components: [
			{
				id: "cpu",
				resource: "cpu",
				billingBasis: "provisioned",
				vendorUnit: "vCPU",
				usdPerUnitHour: 0.0504,
				quantityRule: { kind: "linear", dimension: "vcpus", unitsPerTargetUnit: 1 },
			},
			{
				id: "memory",
				resource: "memory",
				billingBasis: "provisioned",
				vendorUnit: "GiB",
				usdPerUnitHour: 0.0162,
				quantityRule: { kind: "linear", dimension: "memoryGb", unitsPerTargetUnit: 1 },
			},
		],
		targetHourlyCost: { kind: "exact", componentIds: ["cpu", "memory"] },
		notes:
			"Provisioned CPU and memory rates while a sandbox is active; retained storage is billed separately and excluded from compute economics.",
		sources: [
			{
				label: "Superserve pricing",
				url: "https://www.superserve.ai/pricing",
				checkedAt: "2026-11-08",
			},
		],
	},
	maturity: {
		status: "beta",
		notes: "Custom images via Superserve templates built from an OCI image.",
	},
	specPinning: "fixed",
	transport: {
		// The native driver returns completed command envelopes. Commands budgeted at or beyond
		// the 60-second synchronous cap run detached and are polled through the filesystem.
		streaming: false,
		syncCapMs: 60_000,
		detachedPoll: true,
	},
});
