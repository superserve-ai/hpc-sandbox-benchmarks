#!/usr/bin/env bun
// One-command Superserve benchmark runner. It plans the suites (plan.ts), records provenance, drives
// `bench-suite superserve` once per suite, and writes data/raw/<runId>/manifest.json next to the
// per-suite shards (data/runs/<runId>-<suite>-r<i>.json).

import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { TOOLCHAIN_IMAGE_NAME, TOOLCHAIN_VERSION } from "@sandbox-benchmarks/schema";
import { SUPERSERVE_MARKER_KEY } from "../vendor.ts";
import type { Load, Mode, Plan } from "./plan.ts";
import {
	buildPlan,
	CAUSE_AREA_NAMES,
	LOW_LOAD_REPLICATES,
	PRODUCER_CHANGES,
	peakSandboxes,
} from "./plan.ts";

const HELP = `bench:superserve — run the benchmark suites on Superserve and record provenance.

usage: bun run bench:superserve <mode> [target] [options]

modes:
  full                 CPU matrix method: waves synthetic-memory, synthetic-system, realworld in order;
                       every suite of a wave at once at its default replicate count (peak 36 sandboxes).
  low                  One suite at a time, ${LOW_LOAD_REPLICATES} replicate sandboxes each.
  area <name>          Only the suites for one cause area: ${CAUSE_AREA_NAMES.join(", ")}.
  smoke <suite>        One suite, one replicate.

options:
  --load full|low      Load for area mode (default: full).
  --suites a,b         Restrict the plan to these suites.
  --replicates <n>     Override the replicate count of every suite.
  --run-id <id>        Run id prefix (default: ss-<mode>-<UTC timestamp>).
  --dry-run            Print the plan and the provenance checks; create no sandboxes.
  --help               Show this help.

env: SUPERSERVE_API_KEY (required), SUPERSERVE_REGION (declared region, recorded as given).
The in-sandbox producer is cloned from this checkout's origin at HEAD, so HEAD must be pushed.`;

const ROOT = resolve(import.meta.dir, "../../../..");
const TEMPLATE_NAME = `${TOOLCHAIN_IMAGE_NAME}-${TOOLCHAIN_VERSION}`;

function git(...args: string[]): string {
	const result = Bun.spawnSync(["git", ...args], { cwd: ROOT, stderr: "pipe" });
	if (result.exitCode !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr.toString().trim()}`);
	return result.stdout.toString().trim();
}

function publicUrl(url: string): string {
	return url.replace(/^https:\/\/[^@/]*@/, "https://").replace(/\.git$/, "");
}

interface Source {
	sha: string;
	branch: string;
	repoUrl: string;
	clean: boolean;
	pushed: boolean;
}

function readSource(): Source {
	const sha = git("rev-parse", "HEAD");
	return {
		sha,
		branch: git("rev-parse", "--abbrev-ref", "HEAD"),
		repoUrl: process.env.BENCH_REPO_URL || publicUrl(git("remote", "get-url", "origin")),
		clean: git("status", "--porcelain", "--untracked-files=no") === "",
		pushed: git("branch", "--remotes", "--contains", sha) !== "",
	};
}

function checkProducerChanges(): string[] {
	return PRODUCER_CHANGES.filter(
		(change) => !readFileSync(join(ROOT, change.profile), "utf8").includes(change.marker),
	).map((change) => `${change.profile} no longer contains ${change.marker}`);
}

async function readTemplate(apiKey: string) {
	const { Template } = await import("@superserve/sdk");
	const [template, ...others] = (await Template.list({ apiKey, namePrefix: TEMPLATE_NAME })).filter(
		(info) => info.name === TEMPLATE_NAME,
	);
	if (template === undefined || others.length > 0)
		throw new Error(`expected one template named ${TEMPLATE_NAME}`);
	return {
		name: template.name,
		id: template.id,
		status: template.status,
		vcpu: template.vcpu,
		memoryMib: template.memoryMib,
		diskMib: template.diskMib,
		builtAt: template.builtAt?.toISOString() ?? null,
		latestBuildId: template.latestBuildId ?? null,
	};
}

// The API exposes no region or host field, so one sandbox from the same template reports what the
// guest sees: CPU, kernel, resolver, egress address, and the nearest Cloudflare edge.
const PROBE_SCRIPT = [
	"echo cpu_model=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | xargs)",
	"echo cpu_family_model=$(grep -m1 'cpu family' /proc/cpuinfo | cut -d: -f2 | xargs)/$(grep -m1 '^model\\s*:' /proc/cpuinfo | cut -d: -f2 | xargs)",
	"echo cpu_mhz=$(grep -m1 'cpu MHz' /proc/cpuinfo | cut -d: -f2 | xargs)",
	"echo nproc=$(nproc)",
	"echo kernel=$(uname -r)",
	"echo resolver=$(grep -m1 '^nameserver' /etc/resolv.conf | cut -d' ' -f2)",
	"curl -s --max-time 10 https://www.cloudflare.com/cdn-cgi/trace | grep -E '^(ip|colo|loc)=' | sed 's/^ip=/egress_ip=/; s/^colo=/edge_colo=/; s/^loc=/egress_country=/'",
].join("; ");

async function probeGuest(apiKey: string, runId: string): Promise<Record<string, string>> {
	const { Sandbox } = await import("@superserve/sdk");
	const sandbox = await Sandbox.create({
		apiKey,
		name: `${runId}-probe`.slice(0, 63),
		fromTemplate: TEMPLATE_NAME,
		timeoutSeconds: 600,
		metadata: { [SUPERSERVE_MARKER_KEY]: `${runId}-probe` },
	});
	try {
		const result = await sandbox.commands.run(PROBE_SCRIPT, { timeoutMs: 60_000 });
		const fields: Record<string, string> = { sandboxId: sandbox.id };
		for (const line of result.stdout.split("\n")) {
			const at = line.indexOf("=");
			if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1).trim();
		}
		return fields;
	} finally {
		await sandbox.kill();
	}
}

async function liveMarked(apiKey: string) {
	const { Sandbox } = await import("@superserve/sdk");
	const live = await Sandbox.list({
		apiKey,
		status: ["starting", "active", "pausing", "paused", "resuming", "migrating"],
	});
	return live.filter((row) => SUPERSERVE_MARKER_KEY in row.metadata);
}

// Driver markers are per-attempt UUIDs, not per run, so a run owns every marked sandbox created
// after it started. The preflight refuses to start while another run has marked sandboxes alive.
/** Kill marked sandboxes created since the run started (less a clock-skew margin) that are alive. */
async function sweep(apiKey: string, startedAt: Date): Promise<string[]> {
	const since = new Date(startedAt.getTime() - 60_000);
	const { Sandbox } = await import("@superserve/sdk");
	const leftovers = (await liveMarked(apiKey)).filter((row) => row.createdAt >= since);
	for (const row of leftovers) await Sandbox.killById(row.id, { apiKey });
	return leftovers.map((row) => row.id);
}

interface SuiteResult {
	suite: string;
	benchRunId: string;
	replicates: number[];
	startedAt: string;
	endedAt: string;
	exitCode: number;
	log: string;
	sandboxes: Record<string, unknown>[];
}

function readShards(benchRunId: string, replicates: number[]): Record<string, unknown>[] {
	return replicates.map((index) => {
		const shard = join(ROOT, "data/runs", `${benchRunId}-r${index}.json`);
		try {
			const run = JSON.parse(readFileSync(shard, "utf8"));
			const entry = run.providers.find(
				(provider: { providerId: string }) => provider.providerId === "superserve",
			);
			const spec = entry?.observedSpecs ?? {};
			return {
				replicate: index,
				shard: `data/runs/${benchRunId}-r${index}.json`,
				sha: run.sha,
				sandboxId: entry?.artifactEvidence?.[0]?.sandboxId ?? null,
				template: entry?.artifactEvidence?.[0]?.provenance?.requested?.ref ?? null,
				validationStatus: entry?.validationStatus ?? "missing",
				metrics: entry?.metrics?.length ?? 0,
				cpuModel: spec.cpuModel,
				vcpus: spec.vcpus,
				memoryGb: spec.memoryGb,
				diskGb: spec.diskGb,
				kernel: spec.kernel,
				vmm: spec.machineVmm,
			};
		} catch {
			return { replicate: index, shard: null, validationStatus: "missing" };
		}
	});
}

async function runSuite(
	runId: string,
	suite: string,
	replicates: number[],
	env: Record<string, string>,
	logDir: string,
): Promise<SuiteResult> {
	const benchRunId = `${runId}-${suite}`;
	const log = join(logDir, `${suite}.log`);
	const startedAt = new Date().toISOString();
	const fd = openSync(log, "w");
	const child = Bun.spawn(
		[
			"bun",
			"apps/cli/src/bin/bench-suite.ts",
			"superserve",
			suite,
			benchRunId,
			"--replicates",
			replicates.join(","),
			"--require",
			"superserve",
		],
		{ cwd: ROOT, env: { ...process.env, ...env }, stdout: fd, stderr: fd },
	);
	const exitCode = await child.exited;
	closeSync(fd);
	console.log(`[${new Date().toISOString()}] ${suite}: exit ${exitCode}`);
	return {
		suite,
		benchRunId,
		replicates,
		startedAt,
		endedAt: new Date().toISOString(),
		exitCode,
		log: log.slice(ROOT.length + 1),
		sandboxes: readShards(benchRunId, replicates),
	};
}

function describe(plan: Plan): string {
	return plan.steps
		.map(
			(step, index) =>
				`  step ${index + 1} (${step.wave}): ${step.suites
					.map(({ suite, replicates }) => `${suite} x${replicates.length}`)
					.join(", ")}`,
		)
		.join("\n");
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
		options: {
			load: { type: "string" },
			suites: { type: "string" },
			replicates: { type: "string" },
			"run-id": { type: "string" },
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});
	const [mode, target] = positionals;
	if (values.help || mode === undefined) {
		console.log(HELP);
		process.exit(values.help ? 0 : 2);
	}
	if (!["full", "low", "area", "smoke"].includes(mode)) {
		console.error(`unknown mode ${mode}\n\n${HELP}`);
		process.exit(2);
	}
	if (values.load !== undefined && values.load !== "full" && values.load !== "low") {
		console.error("--load must be full or low");
		process.exit(2);
	}
	const plan = buildPlan({
		mode: mode as Mode,
		target,
		load: values.load as Load | undefined,
		suites: values.suites?.split(","),
		replicates: values.replicates === undefined ? undefined : Number(values.replicates),
	});
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d+Z$/, "z")
		.toLowerCase();
	const runId = values["run-id"] ?? `ss-${mode}${plan.area ? `-${plan.area}` : ""}-${stamp}`;
	const source = readSource();
	const problems = [
		...(source.clean ? [] : ["tracked files have uncommitted changes"]),
		...(source.pushed ? [] : [`HEAD ${source.sha} is not on any origin branch; push it first`]),
		...checkProducerChanges(),
	];
	console.log(
		`run ${runId}: mode ${plan.mode}, load ${plan.load}${plan.area ? `, area ${plan.area}` : ""}, peak ${peakSandboxes(plan)} sandboxes\n${describe(plan)}\nsource ${source.repoUrl} @ ${source.sha} (${source.branch})`,
	);
	const apiKey = process.env.SUPERSERVE_API_KEY;
	if (!apiKey) problems.push("SUPERSERVE_API_KEY is not set");
	else {
		const busy = await liveMarked(apiKey);
		if (busy.length > 0)
			problems.push(`${busy.length} benchmark sandboxes are alive; another run may be active`);
	}
	for (const problem of problems) console.error(`preflight: ${problem}`);
	if (values["dry-run"]) {
		if (apiKey) console.log(`template ${JSON.stringify(await readTemplate(apiKey))}`);
		process.exit(0);
	}
	if (problems.length > 0 || !apiKey) {
		console.error("preflight failed; nothing was started");
		process.exit(1);
	}

	const startedAt = new Date();
	const rawDir = join(ROOT, "data/raw", runId);
	const logDir = join(rawDir, "logs");
	mkdirSync(logDir, { recursive: true });
	const manifestPath = join(rawDir, "manifest.json");
	const manifest = {
		runId,
		mode: plan.mode,
		load: plan.load,
		area: plan.area ?? null,
		plan: plan.steps,
		peakSandboxes: peakSandboxes(plan),
		source: { repoUrl: source.repoUrl, sha: source.sha, branch: source.branch },
		producerChanges: PRODUCER_CHANGES,
		template: await readTemplate(apiKey),
		region: {
			declared: process.env.SUPERSERVE_REGION ?? null,
			probe: {} as Record<string, string>,
		},
		runner: { hostname: hostname(), bun: Bun.version },
		startedAt: startedAt.toISOString(),
		endedAt: null as string | null,
		suites: [] as SuiteResult[],
		sweptSandboxes: [] as string[],
	};
	const save = () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	save();
	// An interrupt also reaches the bench-suite children; still kill what the run left alive.
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.once(signal, async () => {
			manifest.sweptSandboxes = await sweep(apiKey, startedAt).catch(() => []);
			manifest.endedAt = new Date().toISOString();
			save();
			process.exit(130);
		});
	try {
		manifest.region.probe = await probeGuest(apiKey, runId);
	} catch (error) {
		manifest.region.probe = { error: String(error) };
	}
	save();
	const env = {
		GITHUB_SHA: source.sha,
		BENCH_REPO_URL: source.repoUrl,
		BENCH_REPO_REF: source.sha,
	};
	try {
		for (const step of plan.steps) {
			console.log(`[${new Date().toISOString()}] ${step.wave}: ${step.suites.map((s) => s.suite)}`);
			const results = await Promise.all(
				step.suites.map(({ suite, replicates }) => runSuite(runId, suite, replicates, env, logDir)),
			);
			manifest.suites.push(...results);
			save();
		}
	} finally {
		manifest.sweptSandboxes = await sweep(apiKey, startedAt);
		manifest.endedAt = new Date().toISOString();
		save();
	}
	const failed = manifest.suites
		.filter((suite) => suite.exitCode !== 0)
		.map((suite) => suite.suite);
	console.log(
		`manifest ${manifestPath.slice(ROOT.length + 1)}; swept ${manifest.sweptSandboxes.length} leftover sandboxes`,
	);
	if (failed.length > 0) {
		console.error(`failed suites: ${failed.join(", ")}`);
		process.exit(1);
	}
}
