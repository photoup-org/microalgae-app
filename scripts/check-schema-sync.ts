/**
 * Guards the cross-repo invariant between REACTOR_SCHEMA.requires here and
 * REQUIREMENTS in the edge driver.
 *
 * These two live in separate repos with no shared build, so nothing else catches
 * a drift. Run: npm run check:schema
 */
import { readFileSync } from "fs";
import { join } from "path";
import { REACTOR_SCHEMA } from "../lib/reactor-schema";

const DRIVER_PATH = join(
    __dirname,
    "../../edge-gateway-docker/python-worker/src/drivers/microalgae_driver.py"
);

/** Pulls REQUIREMENTS = { "ph": ["temp"], ... } out of the Python source. */
function parseEdgeRequirements(source: string): Record<string, string[]> {
    const block = source.match(/REQUIREMENTS\s*=\s*\{([\s\S]*?)\}/);
    if (!block) throw new Error("Could not find REQUIREMENTS in the edge driver.");

    const result: Record<string, string[]> = {};
    const entry = /["'](\w+)["']\s*:\s*\[([^\]]*)\]/g;

    for (const [, metric, deps] of block[1].matchAll(entry)) {
        result[metric] = [...deps.matchAll(/["'](\w+)["']/g)].map((m) => m[1]);
    }
    return result;
}

const edge = parseEdgeRequirements(readFileSync(DRIVER_PATH, "utf8"));
const errors: string[] = [];

for (const item of REACTOR_SCHEMA) {
    const theirs = (edge[item.key] ?? []).slice().sort();
    const ours = item.requires.slice().sort();

    if (JSON.stringify(theirs) !== JSON.stringify(ours)) {
        errors.push(
            `  ${item.key}: app has [${ours}], edge driver has [${theirs}]`
        );
    }
}

for (const metric of Object.keys(edge)) {
    if (!REACTOR_SCHEMA.some((m) => m.key === metric)) {
        errors.push(`  ${metric}: declared in the edge driver but missing from REACTOR_SCHEMA`);
    }
}

if (errors.length > 0) {
    console.error("REACTOR_SCHEMA.requires is out of sync with the edge driver:\n");
    console.error(errors.join("\n"));
    console.error(`\nEdge driver: ${DRIVER_PATH}`);
    process.exit(1);
}

console.log(`✓ REACTOR_SCHEMA.requires matches the edge driver (${REACTOR_SCHEMA.length} metrics).`);
