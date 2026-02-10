import { execSync } from "node:child_process";
import path from "node:path";
import chalk from "chalk";

const DENIED_PATTERNS = [
    /\bsudo\b/,
    /\brm\s+(-[^\s]*\s+)*\/\s*$/,    // rm /
    /\brm\s+-[^\s]*r[^\s]*f|rm\s+-[^\s]*f[^\s]*r/,  // rm -rf or rm -fr variants
    /\bchmod\b/,
    /\bchown\b/,
    /\bmkfs\b/,
    /\bdd\b/,
    /\bcurl\b.*\|\s*(ba)?sh/,          // curl pipe to shell
    /\bwget\b.*\|\s*(ba)?sh/,
];

export function validateCommand(cmd, sandboxDir) {
    const trimmed = cmd.trim();
    if (!trimmed) return { valid: false, reason: "Empty command" };

    for (const pattern of DENIED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { valid: false, reason: `Blocked: command matches denied pattern` };
        }
    }

    // Reject absolute paths
    if (/(?:^|\s)\/[^\s]/.test(trimmed)) {
        return { valid: false, reason: "Absolute paths are not allowed" };
    }

    // Reject path traversal
    if (/(?:^|\s|\/)\.\.(\/|$|\s)/.test(trimmed)) {
        return { valid: false, reason: "Path traversal (..) is not allowed" };
    }

    return { valid: true };
}

export function executeCommand(cmd, sandboxDir) {
    const validation = validateCommand(cmd, sandboxDir);
    if (!validation.valid) {
        return { success: false, error: validation.reason };
    }

    try {
        const stdout = execSync(cmd, {
            cwd: sandboxDir,
            encoding: "utf-8",
            timeout: 10000,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { success: true, output: stdout };
    } catch (err) {
        const stderr = err.stderr || err.message || String(err);
        return { success: false, error: stderr };
    }
}
