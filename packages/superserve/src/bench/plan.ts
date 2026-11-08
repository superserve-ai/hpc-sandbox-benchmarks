// Run plans for the Superserve benchmark runner (run.ts). A plan is an ordered list of steps; the
// suites inside one step run at the same time, each with its replicate sandboxes in flight together
// (one `bench-suite --replicates` process per suite), and the next step starts only when every
// suite of the current step has finished.
//
//   full   The CPU matrix method: one step per collection wave (BENCHMARK_WAVE_ORDER), every suite
//          of the wave at its default replicate count. The realworld wave alone holds 36 sandboxes.
//   low    One suite per step, in wave order, at most LOW_LOAD_REPLICATES sandboxes in flight.
//   area   Only the suites that measure one cause area, at full or low load.
//   smoke  One suite, one replicate.

import type { BenchmarkWave, SuiteName } from "@sandbox-benchmarks/schema";
import { BENCHMARK_WAVE_ORDER, SUITE_NAMES, SUITES } from "@sandbox-benchmarks/schema";

export type Mode = "full" | "low" | "area" | "smoke";
export type Load = "full" | "low";

/** Sandboxes per suite in low-load mode; the suites run one after another. */
export const LOW_LOAD_REPLICATES = 3;

const REALWORLD: SuiteName[] = ["realworld-mastra", "realworld-better-auth", "realworld-openclaw"];

/** The suites to re-run after a fix in one cause area. */
export const CAUSE_AREAS = {
	/** Outbound throughput under concurrency: WAN iperf3, Node download, clone and install. */
	egress: ["network", ...REALWORLD],
	/** Throughput when many sandboxes share hosts: the realworld wave and the Node.js tooling run. */
	"cpu-contention": ["cpu-node", ...REALWORLD],
	/** Single-thread speed: Node.js tooling, PyBench, git operations, pgbench read-only. */
	"cpu-clock": ["cpu-node", "system", "pgbench"],
	/** STREAM. */
	"memory-bandwidth": ["memory"],
	/** fio, hardlink, SQLite, pgbench read-write. */
	disk: ["disk", "system", "pgbench"],
	/** Per-host HTTPS handshake and cold DNS latency. */
	routing: ["network"],
} as const satisfies Record<string, readonly SuiteName[]>;

export type CauseArea = keyof typeof CAUSE_AREAS;
export const CAUSE_AREA_NAMES = Object.keys(CAUSE_AREAS) as CauseArea[];

export interface SuiteRun {
	suite: SuiteName;
	replicates: number[];
}

export interface PlanStep {
	wave: BenchmarkWave;
	suites: SuiteRun[];
}

export interface Plan {
	mode: Mode;
	load: Load;
	area?: CauseArea;
	steps: PlanStep[];
}

export interface PlanOptions {
	mode: Mode;
	/** The cause area (mode "area") or the suite (mode "smoke"). */
	target?: string;
	/** Load for mode "area"; full and low ignore it, smoke is always one sandbox. */
	load?: Load;
	/** Restrict the plan to these suites. */
	suites?: readonly string[];
	/** Override the replicate count of every suite. */
	replicates?: number;
}

function range(count: number): number[] {
	return Array.from({ length: count }, (_, index) => index);
}

function defaultReplicates(suite: SuiteName): number {
	return SUITES[suite].defaultReplicas ?? 1;
}

function assertSuite(name: string): SuiteName {
	if (!(SUITE_NAMES as string[]).includes(name))
		throw new Error(`unknown suite ${name}; expected one of ${SUITE_NAMES.join(", ")}`);
	return name as SuiteName;
}

/** The suites by wave, in registry order within a wave (the order the full plan uses). */
function waveOrder(suites: readonly SuiteName[]): SuiteName[] {
	return BENCHMARK_WAVE_ORDER.flatMap((wave) =>
		SUITE_NAMES.filter((suite) => suites.includes(suite) && SUITES[suite].wave === wave),
	);
}

function stepsFor(suites: readonly SuiteName[], load: Load, replicates?: number): PlanStep[] {
	const ordered = waveOrder(suites);
	if (load === "low")
		return ordered.map((suite) => ({
			wave: SUITES[suite].wave,
			suites: [{ suite, replicates: range(replicates ?? LOW_LOAD_REPLICATES) }],
		}));
	return BENCHMARK_WAVE_ORDER.map((wave) => ({
		wave,
		suites: ordered
			.filter((suite) => SUITES[suite].wave === wave)
			.map((suite) => ({ suite, replicates: range(replicates ?? defaultReplicates(suite)) })),
	})).filter((step) => step.suites.length > 0);
}

export function buildPlan(options: PlanOptions): Plan {
	const { mode, target, replicates } = options;
	if (replicates !== undefined && (!Number.isInteger(replicates) || replicates < 1))
		throw new Error(`--replicates must be a positive integer, got ${replicates}`);
	const restrict = (suites: readonly SuiteName[]): SuiteName[] => {
		if (options.suites === undefined) return [...suites];
		const wanted = options.suites.map(assertSuite);
		const kept = suites.filter((suite) => wanted.includes(suite));
		if (kept.length === 0) throw new Error(`--suites ${wanted.join(",")} selects nothing`);
		return kept;
	};
	switch (mode) {
		case "full":
			return { mode, load: "full", steps: stepsFor(restrict(SUITE_NAMES), "full", replicates) };
		case "low":
			return { mode, load: "low", steps: stepsFor(restrict(SUITE_NAMES), "low", replicates) };
		case "area": {
			if (target === undefined || !(target in CAUSE_AREAS))
				throw new Error(`area needs one of ${CAUSE_AREA_NAMES.join(", ")}`);
			const area = target as CauseArea;
			const load = options.load ?? "full";
			return { mode, load, area, steps: stepsFor(restrict(CAUSE_AREAS[area]), load, replicates) };
		}
		case "smoke": {
			if (target === undefined) throw new Error("smoke needs a suite");
			const suite = assertSuite(target);
			return { mode, load: "low", steps: stepsFor([suite], "low", replicates ?? 1) };
		}
	}
}

/** Most replicate sandboxes the plan has in flight at once. */
export function peakSandboxes(plan: Plan): number {
	return Math.max(
		0,
		...plan.steps.map((step) =>
			step.suites.reduce((sum, { replicates }) => sum + replicates.length, 0),
		),
	);
}

/** Changes to the in-sandbox producer on this branch that a result reader must know about. */
export const PRODUCER_CHANGES = [
	{
		suite: "realworld-mastra",
		task: "test_core",
		profile: "packages/schema/src/pts-profiles/local/realworld-mastra-1.0.0/target.env",
		marker: "--exclude '**/models-dev.e2e.test.ts'",
		change:
			"vitest skips packages/core/src/llm/model/gateways/models-dev.e2e.test.ts, which fetches the live models.dev registry",
	},
] as const;
