/**
 * bash.js — Sandboxed bash command validator and executor.
 *
 * This module is the security layer of ProdBot. Before any command runs,
 * it passes through two checks:
 *   1. A denylist of dangerous command patterns (regex-based)
 *   2. Path validation to prevent escaping the sandbox directory
 *
 * Commands that pass validation are executed via Node's child_process.execSync
 * with the working directory (`cwd`) locked to the sandbox folder. This means
 * a command like `touch foo.txt` creates the file inside the sandbox, not
 * wherever the user launched ProdBot from.
 *
 * Key security concepts demonstrated:
 *   - Denylist filtering: blocking known-dangerous patterns
 *   - Path confinement: preventing directory traversal attacks
 *   - Execution sandboxing: restricting where commands run via `cwd`
 *   - Timeout enforcement: preventing commands from hanging forever
 */

import { execSync } from "node:child_process";
import path from "node:path";
import chalk from "chalk";

/**
 * Regex patterns for commands that should never be executed.
 * Each pattern uses \b (word boundary) to avoid false positives —
 * e.g., \bsudo\b matches "sudo" but not "pseudocode".
 */
const DENIED_PATTERNS = [
    /\bsudo\b/,                                       // privilege escalation
    /\brm\s+(-[^\s]*\s+)*\/\s*$/,                     // rm / (delete root)
    /\brm\s+-[^\s]*r[^\s]*f|rm\s+-[^\s]*f[^\s]*r/,   // rm -rf or rm -fr (recursive force delete)
    /\bchmod\b/,                                       // changing file permissions
    /\bchown\b/,                                       // changing file ownership
    /\bmkfs\b/,                                        // formatting filesystems
    /\bdd\b/,                                          // low-level disk operations
    /\bcurl\b.*\|\s*(ba)?sh/,                          // downloading and piping to shell
    /\bwget\b.*\|\s*(ba)?sh/,                          // same as above with wget
];

/**
 * Validates a bash command before execution.
 *
 * Checks performed (in order):
 *   1. Command is not empty
 *   2. Command does not match any denied pattern
 *   3. Command does not use absolute paths (e.g., /etc/...)
 *   4. Command does not use path traversal (..) to escape the sandbox
 *
 * @param {string} cmd - The bash command to validate
 * @param {string} sandboxDir - The absolute path to the sandbox directory
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateCommand(cmd, sandboxDir) {
    const trimmed = cmd.trim();
    if (!trimmed) return { valid: false, reason: "Empty command" };

    // Check against the denylist
    for (const pattern of DENIED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { valid: false, reason: `Blocked: command matches denied pattern` };
        }
    }

    // Reject absolute paths — commands must only use relative paths within the sandbox
    if (/(?:^|\s)\/[^\s]/.test(trimmed)) {
        return { valid: false, reason: "Absolute paths are not allowed" };
    }

    // Reject path traversal — ".." could escape the sandbox directory
    if (/(?:^|\s|\/)\.\.(\/|$|\s)/.test(trimmed)) {
        return { valid: false, reason: "Path traversal (..) is not allowed" };
    }

    return { valid: true };
}

/**
 * Executes a bash command inside the sandbox directory.
 *
 * The command is first validated, then run with:
 *   - cwd: set to sandboxDir so relative paths resolve inside the sandbox
 *   - timeout: 10 seconds to prevent hanging commands
 *   - stdio: piped so we can capture stdout and stderr
 *
 * @param {string} cmd - The bash command to execute
 * @param {string} sandboxDir - The absolute path to the sandbox directory
 * @returns {{ success: boolean, output?: string, error?: string }}
 */
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
