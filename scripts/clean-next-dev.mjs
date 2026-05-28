import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const devDir = join(process.cwd(), ".next", "dev");

if (existsSync(devDir)) {
  try {
    rmSync(devDir, { force: true, recursive: true });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    console.warn(
      `SignRepair prebuild cleanup skipped for ${devDir} (${code}). Continuing with next build.`,
    );
  }
}
