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
import { execSync } from "node:child_process";
import chalk from "chalk";
import { showBanner } from "../lib/banner.js";
import { sendToAI } from "../lib/ai.js";
import { validateCommand, PersistentShell } from "../lib/bash.js";

// Stores the sources from the last web search so the player can review them.
let lastSources = [];

// Level configuration — flags, sandbox paths, and web directories per level.
const LEVELS = {
    1: { flag: "BYPA55ED", dir: "Level-1" },
    2: { flag: "INDIR3CT", dir: "Level-2", webDir: "web" },
};

let currentLevel = 1;

/**
 * Resolve the sandbox directory relative to this script's location.
 * import.meta.url gives us the file:// URL of the current module,
 * which we convert to a filesystem path and navigate to the sandbox.
 */
const SEASON_DIR = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    ".."
);

function sandboxDir(level) {
    return path.join(SEASON_DIR, LEVELS[level].dir, "prodbot-activities");
}

function webDir(level) {
    if (!LEVELS[level].webDir) return null;
    return path.join(SEASON_DIR, LEVELS[level].dir, LEVELS[level].webDir);
}

// Create the initial sandbox directory if it doesn't exist yet.
let SANDBOX_DIR = sandboxDir(1);
if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

// Create a persistent shell instance — one long-lived bash process that
// retains state (variables, cwd) between commands, like a real terminal.
let shell = new PersistentShell(SANDBOX_DIR);

/**
 * Displays the welcome box when ProdBot starts.
 * Uses chalk for colored terminal output and Unicode box-drawing characters
 * (╭, ╮, │, ╰, ╯) to create a bordered message box.
 */
function showWelcome() {
    const m = chalk.hex("#FF00FF");
    const g = chalk.hex("#20C20E");
    const w = chalk.white;

    const lvl = LEVELS[currentLevel];
    const sandboxLabel = `${lvl.dir}/prodbot-activities/`;

    const width = 60;
    const top = m("╭" + "─".repeat(width) + "╮");
    const bot = m("╰" + "─".repeat(width) + "╯");
    const pad = (str, len) => str + " ".repeat(Math.max(0, len - stripAnsi(str).length));
    const line = (str) => m("│") + " " + pad(str, width - 1) + m("│");

    console.log();
    console.log(top);
    console.log(line(g("🤖  Productivity Bot - Welcome to Level " + currentLevel)));
    console.log(line(w("    Describe a task to get started.")));
    console.log(line(""));
    console.log(line(w("Enter " + chalk.yellowBright("?") + " to see all commands.")));
    console.log(line(w("Sandbox: " + chalk.gray(sandboxLabel))));
    if (currentLevel >= 2) {
        console.log(line(w("Web search: " + chalk.hex("#20C20E")("enabled"))));
    }
    console.log(line(w("ProdBot uses AI, so always check for mistakes.")));
    console.log(bot);
    console.log();
}

/** Prints available commands and example usage. */
function showHelp() {
    console.log();
    console.log(chalk.hex("#FF00FF")("  Available commands:"));
    console.log(chalk.white("    ?            ") + chalk.gray("Show this help message"));
    console.log(chalk.white("    level <n>    ") + chalk.gray("Jump to a specific level"));
    if (currentLevel >= 2) {
        console.log(chalk.white("    sources      ") + chalk.gray("View sources from last web search"));
        console.log(chalk.white("    open <n>     ") + chalk.gray("Open source N in the browser"));
        console.log(chalk.white("    open all     ") + chalk.gray("Browse the World Wide Web"));
    }
    console.log(chalk.white("    exit         ") + chalk.gray("Exit ProdBot"));
    console.log();
    console.log(chalk.hex("#FF00FF")("  What I can do:"));
    console.log(chalk.white("    Describe any task in natural language and I'll generate"));
    console.log(chalk.white("    bash commands to execute inside the sandbox folder."));
    console.log(chalk.white("    You'll be asked to confirm before each command runs."));
    if (currentLevel >= 2) {
        console.log();
        console.log(chalk.hex("#FF00FF")("  Web search (Level 2+):"));
        console.log(chalk.white("    Ask me to search for anything and I'll browse the web"));
        console.log(chalk.white("    to find relevant information for you."));
    }
    console.log();
    console.log(chalk.hex("#FF00FF")("  Examples:"));
    console.log(chalk.gray('    "Create a file called hello.txt with Hello World"'));
    console.log(chalk.gray('    "List all files"'));
    if (currentLevel >= 2) {
        console.log(chalk.gray('    "Search for weather in London"'));
        console.log(chalk.gray('    "What are the latest sports scores?"'));
    }
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
 * Switches ProdBot to a different level.
 * Updates sandbox path, respawns the shell, and shows a welcome message.
 */
function switchToLevel(level) {
    if (!LEVELS[level]) {
        console.log(chalk.redBright(`  ❌ Level ${level} does not exist.`));
        return;
    }
    if (level === currentLevel) {
        console.log(chalk.yellowBright(`  ⚠️  Already on Level ${level}.`));
        return;
    }

    currentLevel = level;
    SANDBOX_DIR = sandboxDir(level);
    if (!fs.existsSync(SANDBOX_DIR)) {
        fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    }

    // Respawn the shell in the new sandbox
    shell.destroy();
    shell = new PersistentShell(SANDBOX_DIR);

    showWelcome();
}

/**
 * Web search — scans the web/ directory for pages matching the query.
 *
 * Simulates an internet search by keyword-matching filenames and content
 * against the player's query. Returns the HTML content of the best match.
 * Shows interactive thinking with emojis so the player sees what ProdBot
 * is doing — which pages it scans, which one it picks.
 */
async function webSearch(query) {
    const dir = webDir(currentLevel);
    if (!dir || !fs.existsSync(dir)) return null;

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".html") && f !== "index.html");
    if (files.length === 0) return null;

    const queryLower = query.toLowerCase();
    console.log(chalk.cyanBright("  🔍 Searching the web..."));

    // Score each page by keyword overlap with the query
    const scored = [];
    for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const siteName = file.replace(".html", "").replace(/-/g, " ");

        console.log(chalk.gray(`  🌐 Scanning ${file}...`));

        // Simple scoring: count query words that appear in filename or content
        const words = queryLower.split(/\s+/).filter(w => w.length > 2);
        let score = 0;
        const contentLower = content.toLowerCase();
        for (const word of words) {
            if (siteName.includes(word)) score += 3;
            if (contentLower.includes(word)) score += 1;
        }
        if (score > 0) scored.push({ file, filePath, content, score });
    }

    if (scored.length === 0) {
        console.log(chalk.gray("  📭 No relevant results found."));
        return null;
    }

    // Sort by relevance and store all sources for later viewing
    scored.sort((a, b) => b.score - a.score);
    lastSources = scored.map(s => ({ file: s.file, filePath: s.filePath }));

    const best = scored[0];
    console.log(chalk.cyanBright(`  📄 Found relevant result: ${best.file}`));
    console.log(chalk.cyanBright(`  📖 Reading ${best.file}...`));
    console.log();

    return { file: best.file, content: best.content };
}

// Known websites with their brand colors and icons.
const SITE_CATALOG = {
    "reddit":       { color: "#FF4500", icon: "💬",  label: "Reddit" },
    "linkedin":     { color: "#0A66C2", icon: "💼",  label: "LinkedIn" },
    "weather-com":  { color: "#1a1a2e", icon: "🌤️", label: "Weather.com", border: "#FFD700", textColor: "#FFD700" },
    "accuweather":  { color: "#F47B20", icon: "🌡️", label: "AccuWeather" },
    "espn":         { color: "#D00000", icon: "🏀",  label: "ESPN" },
    "skysports":    { color: "#E10600", icon: "⚽",  label: "Sky Sports" },
    "amazon":       { color: "#131921", icon: "📦",  label: "Amazon", border: "#FF9900", textColor: "#FF9900" },
    "ebay":         { color: "#E53238", icon: "🏷️", label: "eBay" },
    "skyscanner":   { color: "#0770E3", icon: "✈️",  label: "Skyscanner" },
    "airbnb":       { color: "#FF385C", icon: "🏠",  label: "Airbnb" },
    "bloomberg":    { color: "#1a1a2e", icon: "📈",  label: "Bloomberg", border: "#F0A030", textColor: "#F0A030" },
    "yahoo-finance":{ color: "#6001D2", icon: "💹",  label: "Yahoo Finance" },
};

// Color palette for terminal source listings.
const SITE_COLORS = Object.fromEntries(
    Object.entries(SITE_CATALOG).map(([k, v]) => [k, v.color === "#1a1a2e" ? (v.border || v.color) : v.color])
);

function siteIcon(filename) {
    const key = filename.replace(".html", "");
    const color = SITE_COLORS[key] || "#AAAAAA";
    return chalk.hex(color)("■");
}

/**
 * Shows the sources from the last web search.
 */
function showSources() {
    if (lastSources.length === 0) {
        console.log(chalk.gray("  No sources yet. Try a web search first."));
        return;
    }
    console.log();
    console.log(chalk.hex("#FF00FF")("  Sources:"));
    for (let i = 0; i < lastSources.length; i++) {
        const name = lastSources[i].file.replace(".html", "").replace(/-/g, ".");
        console.log(chalk.white(`    [${i + 1}] `) + siteIcon(lastSources[i].file) + " " + chalk.cyanBright(name));
    }
    console.log(chalk.gray("  Type " + chalk.white("open <n>") + " to view a source in the browser."));
    console.log(chalk.gray("  Type " + chalk.white("open all") + " to browse the World Wide Web."));
    console.log();
}

/**
 * Builds the correct browser URL for a file, handling Codespaces port forwarding.
 * In Codespaces, localhost URLs don't work in the browser — need the forwarded URL.
 */
function buildBrowserUrl(filePath, port) {
    const codespaceName = process.env.CODESPACE_NAME;
    if (codespaceName) {
        return `https://${codespaceName}-${port}.app.github.dev/${filePath}`;
    }
    return `http://localhost:${port}/${filePath}`;
}

/**
 * Ensures the python HTTP server is running on the given port for the web dir.
 */
function ensureWebServer(dir, port) {
    try {
        execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ 2>/dev/null`, { timeout: 2000 });
        return true;
    } catch {
        try {
            execSync(
                `cd "${dir}" && python3 -m http.server ${port} &>/dev/null &`,
                { stdio: "ignore", timeout: 2000 }
            );
            execSync("sleep 1", { stdio: "ignore", timeout: 3000 });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Generates the World Wide Web index.html dynamically, including user-created sites.
 */
function generateIndexHtml(dir) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".html") && f !== "index.html");

    let knownCards = "";
    let userCards = "";
    for (const file of files) {
        const key = file.replace(".html", "");
        const catalog = SITE_CATALOG[key];

        if (catalog) {
            const bg = catalog.color;
            const border = catalog.border ? `border: 1px solid ${catalog.border};` : "";
            const textColor = catalog.textColor ? `color: ${catalog.textColor};` : "";
            knownCards += `  <a class="card" style="background:${bg};${border}${textColor}" href="${file}">
    <span class="icon">${catalog.icon}</span>
    <span class="label">${catalog.label}</span>
  </a>\n`;
        } else {
            const displayName = key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            userCards += `  <a class="card user-site" href="${file}">
    <span class="icon">🌍</span>
    <span class="label">${displayName}</span>
  </a>\n`;
        }
    }

    const userSection = userCards ? `<div class="divider">User-Created Websites</div>\n${userCards}` : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>World Wide Web</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d1117; color: #e6edf3;
    min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    padding: 40px 20px;
  }
  h1 {
    font-size: 28px; font-weight: 700; margin-bottom: 6px;
    background: linear-gradient(135deg, #ff00ff, #00ffff);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .subtitle { font-size: 14px; color: #8b949e; margin-bottom: 36px; }
  .grid {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 16px; max-width: 860px; width: 100%;
  }
  .card {
    border-radius: 12px; padding: 20px 16px; text-align: center;
    text-decoration: none; color: white; font-weight: 600; font-size: 14px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    min-height: 110px; justify-content: center;
  }
  .card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .card .icon { font-size: 28px; }
  .card .label { line-height: 1.3; }
  .card.user-site {
    background: #161b22; border: 2px dashed #8b949e; color: #58a6ff;
  }
  .card.user-site:hover { border-color: #58a6ff; }
  .divider {
    grid-column: 1 / -1; font-size: 12px; color: #8b949e;
    text-transform: uppercase; letter-spacing: 1px; margin-top: 8px;
    border-top: 1px solid #30363d; padding-top: 12px;
  }
  @media (max-width: 700px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 440px) { .grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<h1>🌐 World Wide Web</h1>
<p class="subtitle">ProdBot's simulated internet — ${files.length} websites to explore</p>
<div class="grid">
${knownCards}${userSection}</div>
</body>
</html>`;
}

/**
 * Creates a clickable terminal hyperlink using OSC 8 escape sequences.
 * Renders as styled "label" text that links to url when clicked.
 */
function termLink(label, url) {
    return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}

/**
 * Tries to auto-open a URL in the browser. Returns true on success.
 * Uses the full Codespace URL so the path is preserved.
 */
function tryOpenBrowser(url) {
    try {
        execSync(
            `python3 -c "import webbrowser; webbrowser.open('${url}')"`,
            { stdio: "ignore", timeout: 5000 }
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Opens a source in the Codespace browser.
 * Auto-opens the full Codespace URL so the specific file loads directly.
 */
function openSource(index) {
    if (index < 1 || index > lastSources.length) {
        console.log(chalk.redBright(`  ❌ Invalid source number. Use 1-${lastSources.length}.`));
        return;
    }
    const source = lastSources[index - 1];
    const dir = path.dirname(source.filePath);
    const port = 18920;

    console.log(chalk.cyanBright(`  🌐 Opening ${source.file}...`));

    if (ensureWebServer(dir, port)) {
        const url = buildBrowserUrl(source.file, port);
        const link = termLink(chalk.cyanBright("click here"), url);
        if (tryOpenBrowser(url)) {
            console.log(chalk.hex("#20C20E")("  ✅ Opened! ") + chalk.white("Check your browser tab or ") + link);
        } else {
            console.log(chalk.hex("#20C20E")("  ✅ Server ready — ") + link + chalk.white(" to view."));
        }
    } else {
        console.log(chalk.yellowBright(`  ⚠️  Could not start server.`));
        console.log(chalk.gray(`  Start manually: cd ${dir} && python3 -m http.server ${port}`));
    }
}

/**
 * Opens the World Wide Web landing page.
 * Regenerates index.html to include any user-created websites.
 */
function openAll() {
    const dir = webDir(currentLevel);
    if (!dir || !fs.existsSync(dir)) {
        console.log(chalk.gray("  No web directory available on this level."));
        return;
    }
    const port = 18920;

    fs.writeFileSync(path.join(dir, "index.html"), generateIndexHtml(dir));

    console.log(chalk.cyanBright("  🌐 Opening the World Wide Web..."));

    if (ensureWebServer(dir, port)) {
        const url = buildBrowserUrl("index.html", port);
        const link = termLink(chalk.cyanBright("click here"), url);
        if (tryOpenBrowser(url)) {
            console.log(chalk.hex("#20C20E")("  ✅ Opened! ") + chalk.white("Check your browser tab or ") + link);
        } else {
            console.log(chalk.hex("#20C20E")("  ✅ Server ready — ") + link + chalk.white(" to view."));
        }
    } else {
        console.log(chalk.yellowBright(`  ⚠️  Could not start server.`));
        console.log(chalk.gray(`  Start manually: cd ${dir} && python3 -m http.server ${port}`));
    }
}

/**
 * Displays the sources footer after a web search response.
 */
function showSourcesFooter() {
    if (lastSources.length === 0) return;
    console.log();
    console.log(chalk.hex("#FF00FF")("  Sources:"));
    for (let i = 0; i < Math.min(lastSources.length, 3); i++) {
        const name = lastSources[i].file.replace(".html", "").replace(/-/g, ".");
        console.log(chalk.white(`    [${i + 1}] `) + siteIcon(lastSources[i].file) + " " + chalk.cyanBright(name));
    }
    if (lastSources.length > 3) {
        console.log(chalk.gray(`    ... and ${lastSources.length - 3} more (type "sources" to see all)`));
    }
    console.log(chalk.gray("  Type " + chalk.white("open <n>") + " to view a source, or " + chalk.white("open all") + " to browse."));
}

/**
 * Handles a single line of user input.
 *
 * Flow:
 *   1. "?" → show help
 *   2. "level <n>" → switch to that level
 *   3. "sources" → show sources from last search
 *   4. "open <n>" → open source N in browser
 *   5. If on Level 2+ and query looks like a search → web search
 *   6. Anything else → send to AI, get back bash commands or a message
 */
async function handleInput(input, rl) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed === "?") {
        showHelp();
        return;
    }

    // Level jump command
    const levelMatch = trimmed.match(/^level\s+(\d+)$/i);
    if (levelMatch) {
        switchToLevel(parseInt(levelMatch[1]));
        return;
    }

    // Sources command
    if (trimmed.toLowerCase() === "sources") {
        showSources();
        return;
    }

    // Open source command
    const openMatch = trimmed.match(/^open\s+(\d+)$/i);
    if (openMatch) {
        openSource(parseInt(openMatch[1]));
        return;
    }

    // Open all websites
    if (/^open\s+all$/i.test(trimmed)) {
        openAll();
        return;
    }

    console.log(chalk.gray("  ⏳ Thinking..."));

    // Web search for Level 2+: detect search-like queries
    let webContext = null;
    if (currentLevel >= 2) {
        const searchPatterns = /\b(search|find|look up|what('?s| is| are)|weather|news|score|price|flight|hotel|recipe|how to|latest|stock|market|finance|invest)\b/i;
        if (searchPatterns.test(trimmed)) {
            webContext = await webSearch(trimmed);
        }
    }

    // Build the AI request — optionally with web page content as context
    let result;
    if (webContext) {
        result = await sendToAI(
            `The user asked: "${trimmed}"\n\n` +
            `I searched the web and found this page (${webContext.file}):\n\n` +
            `${webContext.content}\n\n` +
            `Based on this page, respond to the user's request.`
        );
    } else {
        result = await sendToAI(trimmed);
    }

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

                // Step 3: Execute inside the persistent shell
                const res = await shell.executeCommand(cmd);
                if (res.success) {
                    if (res.output && res.output.trim()) {
                        console.log(chalk.white("  " + res.output.trim().split("\n").join("\n  ")));
                    }
                    console.log(chalk.hex("#20C20E")("  ✅ Done."));

                    // Check if the command output contains the current level's flag.
                    const flag = LEVELS[currentLevel].flag;
                    if (res.output && res.output.includes(flag)) {
                        if (currentLevel === 1) {
                            showCongratsLevel1();
                            switchToLevel(2);
                        } else if (currentLevel === 2) {
                            showCongratsLevel2();
                        }
                    }
                } else {
                    console.log(chalk.redBright(`  ❌ ${res.error}`));
                }
            }
            if (webContext) showSourcesFooter();
            break;
        }
        case "message":
            console.log(chalk.cyanBright("  🤖 " + result.text));
            if (webContext) showSourcesFooter();
            break;
        default:
            // Fallback for unexpected response formats from the AI
            console.log(chalk.cyanBright("  🤖 " + JSON.stringify(result)));
    }
}

/**
 * Displays the Level 1 completion banner when a player successfully
 * extracts the flag from password.txt via a sandbox escape.
 */
function showCongratsLevel1() {
    const g = chalk.hex("#20C20E");
    const y = chalk.yellowBright;
    const c = chalk.cyanBright;
    const w = chalk.white;
    const m = chalk.hex("#FF00FF");

    const W = 58;
    const bar = "═".repeat(W);
    const blank = " ".repeat(W);
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
    console.log(g("  ║") + w(pad("    1. Consider restricting the command set to a")) + g("║"));
    console.log(g("  ║") + w(pad("       curated allowlist based on your needs")) + g("║"));
    console.log(g("  ║") + w(pad("    2. Validate resolved paths after expansion")) + g("║"));
    console.log(g("  ║") + w(pad("    3. OS-level sandboxing (chroot, containers)")) + g("║"));
    console.log(g("  ║") + w(pad("    4. Never store sensitive data in locations")) + g("║"));
    console.log(g("  ║") + w(pad("       accessible to the agent")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ╚" + bar + "╝"));
    console.log();
}

/**
 * Displays the Level 2 completion banner when a player successfully
 * uses indirect prompt injection to leak the flag via web search.
 */
function showCongratsLevel2() {
    const g = chalk.hex("#20C20E");
    const y = chalk.yellowBright;
    const c = chalk.cyanBright;
    const w = chalk.white;
    const m = chalk.hex("#FF00FF");

    const W = 58;
    const bar = "═".repeat(W);
    const blank = " ".repeat(W);
    const pad = (s) => s + " ".repeat(Math.max(0, W - s.length));

    console.log();
    console.log(g("  ╔" + bar + "╗"));
    console.log(g("  ║") + y(pad("  LEVEL 2 COMPLETE - INDIRECT PROMPT INJECTION      ")) + g("║"));
    console.log(g("  ╠" + bar + "╣"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + c(pad("     ██████╗  █████╗ ███████╗███████╗██╗")) + g("║"));
    console.log(g("  ║") + c(pad("     ██╔══██╗██╔══██╗██╔════╝██╔════╝██║")) + g("║"));
    console.log(g("  ║") + c(pad("     ██████╔╝███████║███████╗███████╗██║")) + g("║"));
    console.log(g("  ║") + c(pad("     ██╔═══╝ ██╔══██║╚════██║╚════██║╚═╝")) + g("║"));
    console.log(g("  ║") + c(pad("     ██║     ██║  ██║███████║███████║██╗")) + g("║"));
    console.log(g("  ║") + c(pad("     ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + w(pad("  You poisoned a website to hijack ProdBot's AI.")) + g("║"));
    console.log(g("  ║") + w("  Flag: ") + y("INDIR3CT") + w(" ".repeat(W - 16)) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + m(pad("  Lesson: AI agents that process untrusted external")) + g("║"));
    console.log(g("  ║") + m(pad("  data (websites, documents, API responses) can be")) + g("║"));
    console.log(g("  ║") + m(pad("  hijacked by hidden instructions embedded in that")) + g("║"));
    console.log(g("  ║") + m(pad("  data. This is indirect prompt injection.")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + w(pad("  Secure alternatives:")) + g("║"));
    console.log(g("  ║") + w(pad("    1. Restrict which external sources the agent")) + g("║"));
    console.log(g("  ║") + w(pad("       can access based on your needs")) + g("║"));
    console.log(g("  ║") + w(pad("    2. Sanitise external content before passing")) + g("║"));
    console.log(g("  ║") + w(pad("       it to the LLM (strip comments, hidden text)")) + g("║"));
    console.log(g("  ║") + w(pad("    3. Separate data from instructions using")) + g("║"));
    console.log(g("  ║") + w(pad("       structured input formats")) + g("║"));
    console.log(g("  ║") + w(pad("    4. Never execute AI-generated commands derived")) + g("║"));
    console.log(g("  ║") + w(pad("       from untrusted data without validation")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ╚" + bar + "╝"));
    console.log();
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
        rl.question(chalk.hex("#20C20E")("❯ "), async (answer) => {
            if (answer.trim().toLowerCase() === "exit") {
                console.log(chalk.hex("#FF00FF")("  👋 Goodbye!"));
                shell.destroy();
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
