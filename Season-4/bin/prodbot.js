#!/usr/bin/env node

import readline from "node:readline";
import chalk from "chalk";
import { showBanner } from "../lib/banner.js";
import { sendToAI } from "../lib/ai.js";
import { createFile, renameFile } from "../lib/actions.js";

const VERSION = "1.0.0";

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
    console.log(chalk.white('    Create files   ') + chalk.gray('e.g. "Create a file called hello.txt with Hello World"'));
    console.log(chalk.white('    Rename files   ') + chalk.gray('e.g. "Rename hello.txt to greeting.txt"'));
    console.log();
}

function stripAnsi(str) {
    return str.replace(/\u001b\[[0-9;]*m/g, "");
}

async function handleInput(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed === "?") {
        showHelp();
        return;
    }

    console.log(chalk.gray("  ⏳ Thinking..."));

    const result = await sendToAI(trimmed);

    switch (result.action) {
        case "create_file":
            createFile(result.path, result.content || "");
            break;
        case "rename_file":
            renameFile(result.old_path, result.new_path);
            break;
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
            await handleInput(answer);
            prompt();
        });
    };

    prompt();
}

main();
