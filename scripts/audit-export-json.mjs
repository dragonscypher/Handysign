import fs from "node:fs/promises";
import path from "node:path";
import { validateExportPayload } from "./exportAudit.mjs";

async function main() {
    const target = process.argv[2];

    if (!target) {
        console.error("Usage: pnpm audit:export -- <path-to-export.json>");
        process.exitCode = 1;
        return;
    }

    const resolved = path.resolve(process.cwd(), target);
    const raw = await fs.readFile(resolved, "utf8");
    const parsed = JSON.parse(raw);

    validateExportPayload(parsed);
    console.log(`Export audit passed: ${resolved}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
