import { describe, expect, test } from "bun:test";
import { SUITE_NAMES, SUITES } from "@sandbox-benchmarks/schema";
import {
	buildPlan,
	CAUSE_AREA_NAMES,
	CAUSE_AREAS,
	LOW_LOAD_REPLICATES,
	peakSandboxes,
} from "./plan.ts";

const shape = (plan: ReturnType<typeof buildPlan>) =>
	plan.steps.map((step) => [
		step.wave,
		step.suites.map((s) => `${s.suite}x${s.replicates.length}`),
	]);

describe("buildPlan", () => {
	test("full runs the three waves in order, every suite at its default replicate count", () => {
		const plan = buildPlan({ mode: "full" });
		expect(shape(plan)).toEqual([
			["synthetic-memory", ["memoryx3"]],
			["synthetic-system", ["cpu-nodex5", "systemx3", "pgbenchx3", "diskx3", "networkx3"]],
			["realworld", ["realworld-mastrax12", "realworld-better-authx12", "realworld-openclawx12"]],
		]);
		expect(peakSandboxes(plan)).toBe(36);
		const suites = plan.steps.flatMap((step) => step.suites);
		expect(suites.map((s) => s.suite).sort()).toEqual([...SUITE_NAMES].sort());
		for (const { suite, replicates } of suites)
			expect(replicates).toEqual([...Array(SUITES[suite].defaultReplicas).keys()]);
	});

	test("low runs one suite per step with at most the low-load replicate count", () => {
		const plan = buildPlan({ mode: "low" });
		expect(plan.steps).toHaveLength(SUITE_NAMES.length);
		expect(plan.steps.every((step) => step.suites.length === 1)).toBe(true);
		expect(peakSandboxes(plan)).toBe(LOW_LOAD_REPLICATES);
		expect(plan.steps[0]?.suites[0]?.suite).toBe("memory");
	});

	test("area keeps wave order and the default load is full", () => {
		const plan = buildPlan({ mode: "area", target: "egress" });
		expect(plan.load).toBe("full");
		expect(shape(plan)).toEqual([
			["synthetic-system", ["networkx3"]],
			["realworld", ["realworld-mastrax12", "realworld-better-authx12", "realworld-openclawx12"]],
		]);
		expect(shape(buildPlan({ mode: "area", target: "disk", load: "low" }))).toEqual([
			["synthetic-system", ["systemx3"]],
			["synthetic-system", ["pgbenchx3"]],
			["synthetic-system", ["diskx3"]],
		]);
	});

	test("every cause area names registered suites", () => {
		for (const area of CAUSE_AREA_NAMES)
			for (const suite of CAUSE_AREAS[area]) expect(SUITE_NAMES).toContain(suite);
	});

	test("smoke is one suite, one replicate", () => {
		expect(shape(buildPlan({ mode: "smoke", target: "realworld-mastra" }))).toEqual([
			["realworld", ["realworld-mastrax1"]],
		]);
	});

	test("--suites and --replicates narrow a plan", () => {
		const plan = buildPlan({ mode: "full", suites: ["memory", "cpu-node"], replicates: 1 });
		expect(shape(plan)).toEqual([
			["synthetic-memory", ["memoryx1"]],
			["synthetic-system", ["cpu-nodex1"]],
		]);
	});

	test("rejects unknown areas, suites, and replicate counts", () => {
		expect(() => buildPlan({ mode: "area", target: "gpu" })).toThrow("area needs one of");
		expect(() => buildPlan({ mode: "smoke", target: "nope" })).toThrow("unknown suite nope");
		expect(() => buildPlan({ mode: "area", target: "routing", suites: ["memory"] })).toThrow(
			"selects nothing",
		);
		expect(() => buildPlan({ mode: "full", replicates: 0 })).toThrow("positive integer");
	});
});
