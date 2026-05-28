const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
    console.error("Use pnpm for this repo: corepack enable && pnpm install");
    process.exit(1);
}