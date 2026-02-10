#!/usr/bin/env node

import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import { showBanner } from "../lib/banner.js";
import { sendToAI } from "../lib/ai.js";
import { validateCommand, executeCommand } from "../lib/bash.js";

const VERSION = "1.1.0";

const SANDBOX_DIR = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "Level-1",
    "prodbot-activities"
);

// Ensure sandbox exists
if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

function showWelcome() {
    const m = chalk.magenta;
    const g = chalk.green;
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
    console.log(line(w("Enter " + chalk.yellow("?") + " to see all commands.")));
    console.log(line(w("ProdBot uses AI, so always check for mistakes.")));
    console.log(line(w("Sandbox: " + chalk.gray("Level-1/prodbot-activities/"))));
    console.log(bot);
    console.log();
}

function showHelp() {
    console.log();
    console.log(chalk.magenta("  Available commands:"));
    console.log(chalk.white("    ?         ") + chalk.gray("Show this help message"));
    console.log(chalk.white("    exit      ") + chalk.gray("Exit ProdBot"));
    console.log();
    console.log(chalk.magenta("  What I can do:"));
    console.log(chalk.white("    Describe any task in natural language and I'll generate"));
    console.log(chalk.white("    bash commands to execute inside the sandbox folder."));
    console.log(chalk.white("    You'll be asked to confirm before each command runs."));
    console.log();
    console.log(chalk.magenta("  Examples:"));
    console.log(chalk.gray('    "Create a file called hello.txt with Hello World"'));
    console.log(chalk.gray('    "Make a src directory with an index.js file"'));
    console.log(chalk.gray('    "List all files"'));
    console.log(chalk.gray('    "Rename hello.txt to greeting.txt"'));
    console.log();
}

function stripAnsi(str) {
    return str.replace(/\u001b\[[0-9;]*m/g, "");
}

function askConfirmation(rl, cmd) {
    return new Promise((resolve) => {
        console.log(chalk.yellow(`  ⚡ ${cmd}`));
        rl.question(chalk.white("  Execute? (y/n) "), (answer) => {
            resolve(answer.trim().toLowerCase() === "y");
        });
    });
}

async function handleInput(input, rl) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed === "?") {
        showHelp();
        return;
    }

    console.log(chalk.gray("  ⏳ Thinking..."));

    const result = await sendToAI(trimmed);

    switch (result.action) {
        case "bash": {
            const commands = result.commands || [];
            if (commands.length === 0) {
                console.log(chalk.cyan("  🤖 No commands to execute."));
                break;
            }
            for (const cmd of commands) {
                const validation = validateCommand(cmd, SANDBOX_DIR);
                if (!validation.valid) {
                    console.log(chalk.red(`  ❌ Blocked: ${cmd}`));
                    console.log(chalk.red(`     ${validation.reason}`));
                    continue;
                }

                const confirmed = await askConfirmation(rl, cmd);
                if (!confirmed) {
                    console.log(chalk.gray("  ⏭  Skipped."));
                    continue;
                }

                const res = executeCommand(cmd, SANDBOX_DIR);
                if (res.success) {
                    if (res.output && res.output.trim()) {
                        console.log(chalk.white("  " + res.output.trim().split("\n").join("\n  ")));
                    }
                    console.log(chalk.green("  ✅ Done."));
                } else {
                    console.log(chalk.red(`  ❌ ${res.error}`));
                }
            }
            break;
        }
        case "message":
            console.log(chalk.cyan("  🤖 " + result.text));
            break;
        default:
            console.log(chalk.cyan("  🤖 " + JSON.stringify(result)));
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes("--banner")) {
        showBanner();
    }

    showWelcome();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = () => {
        rl.question(chalk.green("❯ "), async (answer) => {
            if (answer.trim().toLowerCase() === "exit") {
                console.log(chalk.magenta("  👋 Goodbye!"));
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
