// Bake the Superserve template through the package's own artifact builder: one template built from
// the digest-pinned base on Superserve's control plane, sized to the target spec.
import { parseDriverEnv } from "@sandbox-benchmarks/driver/env";
import { loadArtifactBuilder } from "@sandbox-benchmarks/drivers";
import { releaseConfig } from "../release-config.ts";
import { describeReplacement } from "./build-provider-artifact.ts";
import { resolveImageDigestRef } from "./image.ts";
import type { Log } from "./types.ts";

/** Build the Superserve template `name` from `baseImage`, replacing a template of that name. */
export async function bakeSuperserveTemplate(
	name: string,
	baseImage: string,
	log: Log,
): Promise<void> {
	const builder = await loadArtifactBuilder("superserve");
	const result = await builder.build({
		name,
		spec: releaseConfig.targetSpec,
		env: parseDriverEnv("superserve", process.env),
		replace: "allowed",
		log,
		signal: new AbortController().signal,
		bakes: "oci",
		base: { digestRef: await resolveImageDigestRef(baseImage) },
		imagesDir: "",
		dockerConfig: "",
	});
	log(describeReplacement("superserve", name, result));
}
