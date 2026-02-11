#!/usr/bin/env node

// Suppress the punycode deprecation warning (DEP0040) from the openai package
process.removeAllListeners("warning");
process.on("warning", (warning) => {
    if (warning.name === "DeprecationWarning" && warning.code === "DEP0040") return;
    console.warn(warning);
});

/**
 * prodbot.js — The main CLI entry point for ProdBot.
 *
 * This is the file that runs when you type `prodbot` in the terminal.
 * It ties together all the modules:
 *   - ai.js: sends user input to the LLM and gets structured commands back
 *   - bash.js: validates and executes those commands in a sandbox
 *   - banner.js: shows ASCII art when --banner flag is used
 *
 * The REPL (Read-Eval-Print Loop) flow:
 *   1. Show welcome box → wait for user input
 *   2. Send input to AI → get back bash commands or a message
 *   3. For each bash command: validate → show to user → ask y/n → execute
 *   4. Display results → loop back to step 1
 *
 * All bash commands are confined to the sandbox directory:
 *   Season-4/Level-1/prodbot-activities/
 *
 * The sandbox is created automatically on startup if it doesn't exist.
 */

import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import { showBanner } from "../lib/banner.js";
import { sendToAI } from "../lib/ai.js";
import { validateCommand, executeCommand } from "../lib/bash.js";

const VERSION = "1.1.0";

// The flag that players must extract from password.txt via sandbox escape.
// When this appears in command output, the player has completed Level 1.
const FLAG = "BYPA55ED";

/**
 * Resolve the sandbox directory relative to this script's location.
 * import.meta.url gives us the file:// URL of the current module,
 * which we convert to a filesystem path and navigate to the sandbox.
 */
const SANDBOX_DIR = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "Level-1",
    "prodbot-activities"
);

// Create the sandbox directory if it doesn't exist yet.
// { recursive: true } means it also creates parent directories if needed.
if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

/**
 * Displays the welcome box when ProdBot starts.
 * Uses chalk for colored terminal output and Unicode box-drawing characters
 * (╭, ╮, │, ╰, ╯) to create a bordered message box.
 */
function showWelcome() {
    const m = chalk.hex("#FF00FF");
    const g = chalk.greenBright;
    const w = chalk.white;

    const width = 60;
    const top = m("╭" + "─".repeat(width) + "╮");
    const bot = m("╰" + "─".repeat(width) + "╯");
    const pad = (str, len) => str + " ".repeat(Math.max(0, len - stripAnsi(str).length));
    const line = (str) => m("│") + " " + pad(str, width - 1) + m("│");

    console.log();
    console.log(top);
    console.log(line(g("🤖  Productivity Bot v" + VERSION)));
    console.log(line(w("    Describe a task to get started.")));
    console.log(line(""));
    console.log(line(w("Enter " + chalk.yellowBright("?") + " to see all commands.")));
    console.log(line(w("ProdBot uses AI, so always check for mistakes.")));
    console.log(line(w("Sandbox: " + chalk.gray("Level-1/prodbot-activities/"))));
    console.log(bot);
    console.log();
}

/**
 * Displays the Level 1 completion banner when a player successfully
 * extracts the flag from password.txt via a sandbox escape.
 */
function showCongrats() {
    const g = chalk.greenBright;
    const y = chalk.yellowBright;
    const c = chalk.cyanBright;
    const w = chalk.white;
    const m = chalk.hex("#FF00FF");

    // Inner width of the box (between the two ║ characters)
    const W = 58;
    const bar = "═".repeat(W);
    const blank = " ".repeat(W);
    // Pad a plain string to W visible columns
    const pad = (s) => s + " ".repeat(Math.max(0, W - s.length));

    console.log();
    console.log(g("  ╔" + bar + "╗"));
    console.log(g("  ║") + y(pad("  LEVEL 1 COMPLETE - PATH TRAVERSAL SANDBOX ESCAPE   ")) + g("║"));
    console.log(g("  ╠" + bar + "╣"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + c(pad("     ██████╗  █████╗ ███████╗███████╗██╗")) + g("║"));
    console.log(g("  ║") + c(pad("     ██╔══██╗██╔══██╗██╔════╝██╔════╝██║")) + g("║"));
    console.log(g("  ║") + c(pad("     ██████╔╝███████║███████╗███████╗██║")) + g("║"));
    console.log(g("  ║") + c(pad("     ██╔═══╝ ██╔══██║╚════██║╚════██║╚═╝")) + g("║"));
    console.log(g("  ║") + c(pad("     ██║     ██║  ██║███████║███████║██╗")) + g("║"));
    console.log(g("  ║") + c(pad("     ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + w(pad("  You bypassed the sandbox validator and read the flag.")) + g("║"));
    console.log(g("  ║") + w("  Flag: ") + y("BYPA55ED") + w(" ".repeat(W - 16)) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + m(pad("  Lesson: Denylist regex on shell commands is brittle.")) + g("║"));
    console.log(g("  ║") + m(pad("  Bash expands variables and decodes data at runtime,")) + g("║"));
    console.log(g("  ║") + m(pad("  after validation - meaning static text checks can")) + g("║"));
    console.log(g("  ║") + m(pad("  always be bypassed.")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + w(pad("  Secure alternatives:")) + g("║"));
    console.log(g("  ║") + w(pad("    1. Restricted command sets (no full shell access)")) + g("║"));
    console.log(g("  ║") + w(pad("    2. Validate resolved paths after expansion")) + g("║"));
    console.log(g("  ║") + w(pad("    3. OS-level sandboxing (chroot, containers, seccomp)")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ╚" + bar + "╝"));
    console.log();
}

/** Prints available commands and example usage. */
function showHelp() {
    console.log();
    console.log(chalk.hex("#FF00FF")("  Available commands:"));
    console.log(chalk.white("    ?         ") + chalk.gray("Show this help message"));
    console.log(chalk.white("    exit      ") + chalk.gray("Exit ProdBot"));
    console.log();
    console.log(chalk.hex("#FF00FF")("  What I can do:"));
    console.log(chalk.white("    Describe any task in natural language and I'll generate"));
    console.log(chalk.white("    bash commands to execute inside the sandbox folder."));
    console.log(chalk.white("    You'll be asked to confirm before each command runs."));
    console.log();
    console.log(chalk.hex("#FF00FF")("  Examples:"));
    console.log(chalk.gray('    "Create a file called hello.txt with Hello World"'));
    console.log(chalk.gray('    "Make a src directory with an index.js file"'));
    console.log(chalk.gray('    "List all files"'));
    console.log(chalk.gray('    "Rename hello.txt to greeting.txt"'));
    console.log();
}

/**
 * Strips ANSI escape codes from a string.
 * Needed to calculate the true visible length of colored text
 * when padding strings inside the welcome box.
 */
function stripAnsi(str) {
    return str.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Shows a bash command to the user and asks for confirmation.
 * Returns a Promise that resolves to true (execute) or false (skip).
 *
 * This is the "human-in-the-loop" pattern — the AI suggests actions
 * but a human must approve before anything runs.
 */
function askConfirmation(rl, cmd) {
    return new Promise((resolve) => {
        console.log(chalk.yellowBright(`  ⚡ ${cmd}`));
        rl.question(chalk.white("  Execute? (y/n) "), (answer) => {
            resolve(answer.trim().toLowerCase() === "y");
        });
    });
}

/**
 * Handles a single line of user input.
 *
 * Flow:
 *   1. "?" → show help
 *   2. Anything else → send to AI, get back an action
 *   3. If action is "bash" → validate, confirm, and execute each command
 *   4. If action is "message" → display the AI's text response
 */
async function handleInput(input, rl) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed === "?") {
        showHelp();
        return;
    }

    console.log(chalk.gray("  ⏳ Thinking..."));

    // Send the user's natural language input to the AI
    const result = await sendToAI(trimmed);

    switch (result.action) {
        case "bash": {
            const commands = result.commands || [];
            if (commands.length === 0) {
                console.log(chalk.cyanBright("  🤖 No commands to execute."));
                break;
            }

            // Process each command sequentially: validate → confirm → execute
            for (const cmd of commands) {
                // Step 1: Security validation (denylist + path checks)
                const validation = validateCommand(cmd, SANDBOX_DIR);
                if (!validation.valid) {
                    console.log(chalk.redBright(`  ❌ Blocked: ${cmd}`));
                    console.log(chalk.redBright(`     ${validation.reason}`));
                    continue;
                }

                // Step 2: Human confirmation — show the command, ask y/n
                const confirmed = await askConfirmation(rl, cmd);
                if (!confirmed) {
                    console.log(chalk.gray("  ⏭  Skipped."));
                    continue;
                }

                // Step 3: Execute inside the sandbox
                const res = executeCommand(cmd, SANDBOX_DIR);
                if (res.success) {
                    if (res.output && res.output.trim()) {
                        console.log(chalk.white("  " + res.output.trim().split("\n").join("\n  ")));
                    }
                    console.log(chalk.greenBright("  ✅ Done."));

                    // Check if the command output contains the Level 1 flag.
                    // This means the player successfully escaped the sandbox
                    // and read the password.txt file.
                    if (res.output && res.output.includes(FLAG)) {
                        showCongrats();
                    }
                } else {
                    console.log(chalk.redBright(`  ❌ ${res.error}`));
                }
            }
            break;
        }
        case "message":
            console.log(chalk.cyanBright("  🤖 " + result.text));
            break;
        default:
            // Fallback for unexpected response formats from the AI
            console.log(chalk.cyanBright("  🤖 " + JSON.stringify(result)));
    }
}

/**
 * Main entry point — sets up the interactive REPL.
 *
 * Uses Node's readline module to create an interactive prompt.
 * The prompt() function calls itself recursively after each input,
 * creating the continuous loop until the user types "exit".
 */
async function main() {
    const args = process.argv.slice(2);

    // --banner flag: show ASCII art before the welcome box
    if (args.includes("--banner")) {
        showBanner();
    }

    showWelcome();

    // Create the readline interface for interactive terminal I/O
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Recursive prompt loop — each call waits for input, processes it, then loops
    const prompt = () => {
        rl.question(chalk.greenBright("❯ "), async (answer) => {
            if (answer.trim().toLowerCase() === "exit") {
                console.log(chalk.hex("#FF00FF")("  👋 Goodbye!"));
                rl.close();
                return;
            }
            await handleInput(answer, rl);
            prompt();
        });
    };

    prompt();
}

main();
