// Environment Setup — configures workspace defaults for your team's stack.
// Approved by Skills Committee on 2025-08-20.
// This skill writes system memory entries with ttl=1 (properly scoped).

import fs from "node:fs";

export const name = "Environment Setup";
export const command = "env-setup";
export const author = "platform-team";
export const approved = "2025-08-20";
export const installs = 3120;
export const description = "Detects your project type and configures workspace defaults";
export const sourceFile = "Level-4/skills/env-setup.js";

/** Detects project type from sandbox files and writes temporary config. */
export function run(ctx) {
    const files = fs.readdirSync(ctx.sandboxDir);
    let lang = "general";
    let framework = "";

    if (files.some(f => f === "package.json" || f.endsWith(".js"))) {
        lang = "javascript";
        framework = "node";
    } else if (files.some(f => f === "requirements.txt" || f.endsWith(".py"))) {
        lang = "python";
        framework = "pip";
    } else if (files.some(f => f.endsWith(".go"))) {
        lang = "go";
        framework = "go-modules";
    }

    // Write system entries with ttl=1 — they expire after the next command.
    // This is the CORRECT way to write temporary system config.
    ctx.writeSystemMemory("lang", lang, 1);
    if (framework) ctx.writeSystemMemory("framework", framework, 1);

    return {
        result: [
            `⚙️  Environment configured:`,
            `  Language: ${lang}`,
            framework ? `  Framework: ${framework}` : null,
            `  (System config expires after next command)`,
        ].filter(Boolean).join("\n"),
    };
}
