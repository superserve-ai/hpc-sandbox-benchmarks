// The Superserve template builder: one template from the digest-pinned toolchain base, sized to
// the target, built under the release lane's name by the SDK's `Template.create` and awaited with
// `waitUntilReady`. The guest's PID 1 is the image's own init, so no build steps are needed.
//
// A template name cannot be rebuilt from a new base in place, so an existing name is deleted and
// then created again: the replacement is destructive.

import type { EnvOf } from "@sandbox-benchmarks/driver";
import { defineArtifactBuilder } from "@sandbox-benchmarks/driver/artifact";

/** The SDK's template surface, structurally; the default export binds the real one. */
export type SuperserveTemplateSdk = Pick<typeof import("@superserve/sdk"), "Template">;

export function superserveArtifactBuilder(
	sdk: () => Promise<SuperserveTemplateSdk> = () => import("@superserve/sdk"),
) {
	return defineArtifactBuilder<"superserve", EnvOf<"superserve">>("superserve", async (request) => {
		const { name, base, spec, env, replace, log, signal } = request;
		const { Template } = await sdk();
		const connection = { apiKey: env.SUPERSERVE_API_KEY, signal };
		const existing = (await Template.list({ ...connection, namePrefix: name })).filter(
			(template) => template.name === name,
		);
		if (existing.length > 0 && replace === "forbidden")
			throw new Error(`Superserve template ${name} already exists and may not be replaced`);
		for (const template of existing) {
			log(`superserve Template.deleteById ${name} (${template.id})`);
			await Template.deleteById(template.id, connection);
		}
		const replaced = existing.length > 0 ? "destructive" : "none";
		try {
			signal.throwIfAborted();
			log(`superserve Template.create ${name} (base ${base.digestRef})`);
			const template = await Template.create({
				...connection,
				name,
				from: base.digestRef,
				vcpu: spec.vcpus,
				memoryMib: spec.memoryGb * 1024,
				...(spec.diskGb !== undefined && { diskMib: spec.diskGb * 1024 }),
			});
			const info = await template.waitUntilReady({ signal, onLog: (event) => log(event.text) });
			if (info.status !== "ready")
				throw new Error(`Superserve template ${name} finished ${info.status}`);
			log(`superserve template ready: ${info.id}`);
			return { ref: name, replaced };
		} catch (error) {
			if (replaced === "destructive")
				throw new Error(
					`Superserve template ${name} was deleted for replacement and no longer resolves`,
					{ cause: error },
				);
			throw error;
		}
	});
}

export default superserveArtifactBuilder();
