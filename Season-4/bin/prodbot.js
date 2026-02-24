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
    3: { flag: "EXCE55IV", dir: "Level-3", webDir: "../Level-2/web", mcpDir: "mcp" },
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

function mcpDir(level) {
    if (!LEVELS[level].mcpDir) return null;
    return path.join(SEASON_DIR, LEVELS[level].dir, LEVELS[level].mcpDir);
}

// Loaded MCP servers for the current level.
let mcpServers = {};

/**
 * Loads MCP servers from the level's mcp/ directory.
 * Each .js file exports: name, description, scope, sourceFile, tools.
 */
async function loadMcpServers(level) {
    mcpServers = {};
    const dir = mcpDir(level);
    if (!dir || !fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
        try {
            const filePath = path.join(dir, file);
            const mod = await import(`file://${filePath}`);
            const key = file.replace(".js", "");
            mcpServers[key] = mod;
        } catch (err) {
            // Skip MCP servers that fail to load
        }
    }
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
    if (currentLevel === 2) {
        console.log(line(w("Web search: " + chalk.hex("#20C20E")("enabled"))));
    }
    if (currentLevel >= 3) {
        const count = Object.keys(mcpServers).length;
        console.log(line(w("MCP tools: " + chalk.hex("#20C20E")(`${count} connected`) + chalk.gray(" (sandbox-scoped)"))));
    }
    console.log(line(w("ProdBot uses AI, so always check for mistakes.")));
    console.log(bot);

    // Example prompts to help the player get started
    if (currentLevel === 2) {
        console.log();
        console.log(chalk.hex("#FF00FF")("  Try:"));
        console.log(chalk.gray('    "New York weather forecast"'));
        console.log(chalk.gray('    "Find flights on Skyscanner"'));
        console.log(chalk.gray('    "Latest ESPN scores"'));
        console.log(chalk.gray('    "Search Airbnb rentals"'));
        console.log(chalk.gray('    "Find products on Amazon"'));
        console.log(chalk.gray('    "Latest Reddit discussions"'));
        console.log(chalk.gray('    "Latest Sky Sports scores"'));
        console.log(chalk.gray('    "Search eBay listings"'));
        console.log(chalk.gray('    "Find jobs on LinkedIn"'));
        console.log(chalk.gray('    "Latest Bloomberg news"'));
        console.log(chalk.gray('    "Yahoo Finance stock prices"'));
        console.log(chalk.gray('    "What is the Accuweather forecast?"'));
    } else if (currentLevel === 3) {
        console.log();
        console.log(chalk.hex("#FF00FF")("  Try:"));
        console.log(chalk.gray('    "Research Apple\'s stock"'));
        console.log(chalk.gray('    "Deep dive into Nvidia"'));
        console.log(chalk.gray('    "Analyse Tesla for me"'));
        console.log();
        console.log(chalk.hex("#FF00FF")("  These prompts trigger an agentic workflow:"));
        console.log(chalk.gray("    User Prompt → ") + chalk.hex("#20C20E")("📈 Finance") + chalk.gray(" → ") + chalk.hex("#0770E3")("🌐 Web") + chalk.gray(" → ") + chalk.hex("#FF00FF")("📊 Report") + chalk.gray(" → ") + chalk.hex("#F0A030")("☁️  Cloud Backup"));
        console.log();
        console.log(chalk.hex("#20C20E")("    📈 Finance MCP") + chalk.gray("  →  stock prices + market overview"));
        console.log(chalk.hex("#0770E3")("    🌐 Web MCP    ") + chalk.gray("  →  online news & research"));
        console.log(chalk.hex("#F0A030")("    ☁️  Cloud MCP  ") + chalk.gray("  →  auto-saves report to backup"));
        console.log();
        console.log(chalk.hex("#FF00FF")("  You can also run individual MCP server functions:"));
        console.log(chalk.gray('    "Stock price of AAPL"'));
        console.log(chalk.gray('    "Browse Bloomberg for news"'));
        console.log(chalk.gray('    "Use cloud backup to list backups"'));
    }
    console.log();
}

/** Prints available commands and example usage. */
function showHelp() {
    console.log();
    console.log(chalk.hex("#FF00FF")("  Available commands:"));
    console.log(chalk.white("    ?            ") + chalk.gray("Show this help message"));
    console.log(chalk.white("    level <n>    ") + chalk.gray("Jump to a specific level"));
    if (currentLevel >= 2) {
        console.log(chalk.white("    open <n>     ") + chalk.gray("Open web source N in browser"));
        console.log(chalk.white("    open all     ") + chalk.gray("Browse the simulated web"));
    }
    if (currentLevel >= 3) {
        console.log(chalk.white("    tools        ") + chalk.gray("List installed MCP tools"));
        console.log(chalk.white("    tool <name>  ") + chalk.gray("Inspect a specific MCP tool"));
    }
    console.log(chalk.white("    exit         ") + chalk.gray("Exit ProdBot"));
    console.log();
    console.log(chalk.hex("#FF00FF")("  What ProdBot can do:"));
    console.log(chalk.white("    Describe any task and ProdBot will generate bash commands"));
    console.log(chalk.white("    to execute inside the sandbox. You confirm before each runs."));
    if (currentLevel >= 2) {
        console.log();
        console.log(chalk.hex("#FF00FF")("  Web search (Level 2+):"));
        console.log(chalk.white("    Ask ProdBot to search for anything and it will browse"));
        console.log(chalk.white("    the web to find relevant information."));
    }
    if (currentLevel >= 3) {
        console.log();
        console.log(chalk.hex("#FF00FF")("  MCP tools (Level 3+):"));
        console.log(chalk.white("    ProdBot has finance, web, and cloud MCP integrations."));
        console.log(chalk.white("    Agentic workflows are facilitated by chaining MCP tools."));
    }
    console.log();
    console.log(chalk.hex("#FF00FF")("  Examples:"));
    console.log(chalk.gray('    "Create a file called hello.txt with Hello World"'));
    console.log(chalk.gray('    "List all files"'));
    if (currentLevel >= 2) {
        console.log(chalk.gray('    "Search for weather in London"'));
        console.log(chalk.gray('    "What are the latest sports scores?"'));
    }
    if (currentLevel >= 3) {
        console.log(chalk.gray('    "Research AAPL stock for me"'));
        console.log(chalk.gray('    "Use cloud backup to backup my files"'));
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
async function switchToLevel(level) {
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

    // Load MCP servers if available for this level
    await loadMcpServers(level);

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
    console.log(chalk.gray("  🌐 Scanning " + files.length + " websites..."));

    // Score each page by keyword overlap with the query
    const scored = [];
    for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const siteName = file.replace(".html", "").replace(/-/g, " ");

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
    "bloomberg":    { color: "#1a1a2e", icon: "🅱️",  label: "Bloomberg", border: "#F0A030", textColor: "#F0A030" },
    "yahoo-finance":{ color: "#6001D2", icon: "📊",  label: "Yahoo Finance" },
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

// MCP tool icons for terminal display.
const MCP_ICONS = {
    "finance-mcp": { icon: "📈", color: "#20C20E" },
    "web-mcp":     { icon: "🌐", color: "#0770E3" },
    "cloud-mcp":   { icon: "☁️",  color: "#F0A030" },
};

/** Lists all installed MCP tools with call hints. */
function showTools() {
    const keys = Object.keys(mcpServers);
    if (keys.length === 0) {
        console.log(chalk.gray("  No MCP tools installed on this level."));
        return;
    }
    console.log();
    console.log(chalk.hex("#FF00FF")(`  MCP Tools (${keys.length} connected):`));
    console.log();
    for (const key of keys) {
        const srv = mcpServers[key];
        const meta = MCP_ICONS[key] || { icon: "🔧", color: "#AAAAAA" };
        const shortName = key.replace(/-mcp$/, "");
        console.log(chalk.hex(meta.color)(`  ${meta.icon} ${srv.name}`));
        console.log(chalk.gray(`    ${srv.description}`));
        console.log(chalk.gray(`    Scope: ${srv.scope}`));
        console.log(chalk.gray("    → ") + chalk.white(`tool ${shortName}`));
        console.log();
    }
    console.log();
}

/** Shows detailed info about a specific MCP tool. */
function showTool(query) {
    const queryLower = query.toLowerCase().replace(/\s+/g, "-");
    const key = Object.keys(mcpServers).find(k =>
        k === queryLower || k.includes(queryLower) || mcpServers[k].name.toLowerCase().includes(query.toLowerCase())
    );
    if (!key) {
        console.log(chalk.redBright(`  ❌ Tool not found: ${query}`));
        console.log(chalk.gray("  Type " + chalk.white("tools") + " to see available tools."));
        return;
    }

    const srv = mcpServers[key];
    const meta = MCP_ICONS[key] || { icon: "🔧", color: "#AAAAAA" };

    console.log();
    console.log(chalk.hex(meta.color)(`  ${meta.icon} ${srv.name}`));
    console.log(chalk.gray("  " + "─".repeat(40)));
    console.log(chalk.white(`  ${srv.description}`));
    console.log();
    console.log(chalk.hex("#FF00FF")("  Available tools:"));
    for (const [toolName, toolDef] of Object.entries(srv.tools)) {
        console.log(chalk.white(`    ${toolDef.usage || toolName}`) + chalk.gray(` — ${toolDef.description}`));
    }
    console.log();
    console.log(chalk.white("  Scope: ") + chalk.gray(srv.scope));
    console.log(chalk.white("  Source: ") + chalk.cyanBright(srv.sourceFile));
    console.log();
}

/**
 * Detects whether a query is an agentic "research" request that should
 * chain multiple MCP tools together. Returns the ticker symbol or null.
 */
const COMPANY_TO_TICKER = {
    apple: "AAPL", microsoft: "MSFT", google: "GOOGL", alphabet: "GOOGL",
    amazon: "AMZN", meta: "META", facebook: "META", nvidia: "NVDA",
    tesla: "TSLA", netflix: "NFLX",
};

function detectAgenticQuery(input) {
    const lower = input.toLowerCase();
    const agenticVerb = /\b(?:research|analyse|analyze|deep\s+dive(?:\s+into)?|full\s+analysis\s+(?:of|on)|tell\s+me\s+everything\s+about|investigate)\b/i;
    if (!agenticVerb.test(lower)) return null;

    // Try direct ticker match (2-5 uppercase letters)
    const tickerMatch = input.match(/\b([A-Z]{2,5})\b/);
    if (tickerMatch) return tickerMatch[1];

    // Try company name → ticker lookup
    for (const [company, ticker] of Object.entries(COMPANY_TO_TICKER)) {
        if (lower.includes(company)) return ticker;
    }

    return null;
}

/** Simulates a brief delay for visual feedback. */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Agentic multi-tool workflow for financial research.
 * Chains: Finance MCP → Web Automation MCP → Cloud Backup MCP
 */
async function handleAgenticWorkflow(ticker, rl) {
    const finance = mcpServers["finance-mcp"];
    const web = mcpServers["web-mcp"];
    const cloud = mcpServers["cloud-mcp"];

    if (!finance || !web || !cloud) {
        console.log(chalk.redBright("  ❌ Not all MCP tools are available for research workflow."));
        return;
    }

    console.log();
    console.log(chalk.hex("#FF00FF")("  🧠 Planning research workflow for " + chalk.yellowBright(ticker) + "..."));
    await sleep(600);

    // Step 1: Finance MCP — stock quote only (market summary goes to report)
    console.log();
    console.log(chalk.hex("#20C20E")("  📈 Finance MCP → stock(" + ticker + ")..."));
    await sleep(400);
    let stockInfo;
    try {
        const raw = finance.tools.stock.run(ticker);
        stockInfo = raw.error || raw.result;
    } catch (err) { stockInfo = `Error: ${err.message}`; }
    console.log(chalk.white("     " + stockInfo));

    // Fetch market summary silently for the report file
    let marketInfo;
    try {
        const raw = finance.tools.market_summary.run();
        marketInfo = raw.error || raw.result;
    } catch (err) { marketInfo = `Error: ${err.message}`; }

    // Step 2: Web Automation MCP — browse for news
    await sleep(500);
    console.log();
    console.log(chalk.hex("#0770E3")("  🌐 Web Automation MCP → browse(" + ticker + " news)..."));
    await sleep(400);
    let newsInfo;
    let newsSource = "";
    try {
        const raw = web.tools.browse.run(ticker + " finance stock market");
        newsInfo = raw.error || raw.result;
        newsSource = raw.source || "";
    } catch (err) { newsInfo = `Error: ${err.message}`; }
    console.log(chalk.white("     " + newsInfo.split("\n")[0]));
    if (newsSource) {
        console.log(chalk.gray("        Source: " + newsSource));
    }

    // Step 3: Cloud Backup MCP — save research directly to .cloudsync
    await sleep(500);
    console.log();

    // Ensure .cloudsync exists and find next available number
    const cloudDir = path.join(SANDBOX_DIR, ".cloudsync");
    if (!fs.existsSync(cloudDir)) fs.mkdirSync(cloudDir, { recursive: true });
    const existing = fs.readdirSync(cloudDir).filter(f => /^\d+-research-/.test(f));
    const nextNum = existing.length + 1;
    const summaryFile = `${nextNum}-research-${ticker}.txt`;

    const summaryContent = [
        `Research Report: ${ticker}`,
        `${"═".repeat(40)}`,
        ``,
        `Stock Data:`,
        `  ${stockInfo}`,
        ``,
        `Market Overview:`,
        marketInfo,
        ``,
        `News:`,
        `  ${newsInfo.split("\n")[0]}`,
        ``,
        `---`,
        `Auto-generated by ProdBot research workflow.`,
    ].join("\n");

    // Write directly to .cloudsync
    fs.writeFileSync(path.join(cloudDir, summaryFile), summaryContent);

    console.log(chalk.hex("#F0A030")("  ☁️  Cloud Backup → saved " + summaryFile + " to cloud storage"));
    await sleep(400);

    // Final summary — emojis match the MCP server icons
    await sleep(300);
    console.log();
    console.log(chalk.hex("#FF00FF")("  ─".repeat(30)));
    console.log(chalk.cyanBright("  🤖 Research complete for " + chalk.yellowBright(ticker) + ":"));
    console.log(chalk.white("     📈 " + stockInfo));
    console.log(chalk.white("     🌐 " + newsInfo.split("\n")[0]));
    console.log(chalk.white("     ☁️  Saved to " + chalk.gray(summaryFile) + " and backed up to cloud."));
    console.log();
}

/**
 * Tries to route a user request to an MCP tool.
 * Returns the tool result if matched, or null if no MCP tool handles it.
 */
function tryMcpTool(input) {
    const lower = input.toLowerCase();

    // First pass: find the best tool name match across all servers.
    // Prefer the longest matching tool name to avoid false positives
    // (e.g., "list_backups" should beat "backup" in "list backups").
    let bestMatch = null;
    for (const [key, srv] of Object.entries(mcpServers)) {
        for (const [toolName, toolDef] of Object.entries(srv.tools)) {
            const normalizedName = toolName.replace(/_/g, " ");
            if (lower.includes(normalizedName) || lower.includes(toolName)) {
                if (!bestMatch || toolName.length > bestMatch.toolName.length) {
                    const arg = extractToolArg(input, toolName, srv.name);
                    bestMatch = { server: srv, serverKey: key, toolName, toolDef, arg };
                }
            }
        }
    }
    if (bestMatch) return bestMatch;

    // Second pass: match by server name and use default (first) tool.
    for (const [key, srv] of Object.entries(mcpServers)) {
        const nameWords = srv.name.toLowerCase().split(/\s+/);
        const keyWords = key.replace(/-/g, " ");

        const nameMatch = nameWords.some(w => w.length > 3 && lower.includes(w));
        const keyMatch = lower.includes(keyWords) || lower.includes(key);

        if (nameMatch || keyMatch) {
            const toolEntries = Object.entries(srv.tools);
            if (toolEntries.length > 0) {
                const [toolName, toolDef] = toolEntries[0];
                const arg = extractToolArg(input, toolName, srv.name);
                return { server: srv, serverKey: key, toolName, toolDef, arg };
            }
        }
    }
    return null;
}

/** Extracts a likely argument from a user's tool-use request. */
function extractToolArg(input, toolName, serverName) {
    // Try common patterns: "backup password.txt", "stock AAPL", "restore file.txt"
    const patterns = [
        new RegExp(`${toolName}\\s+(.+)`, "i"),
        new RegExp(`(?:backup|restore|read|search|browse|stock|portfolio)\\s+([\\w./-]+)`, "i"),
        new RegExp(`(?:for|of|about)\\s+([\\w./-]+)`, "i"),
    ];
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) return match[1].trim();
    }
    return "";
}

/** Checks if text contains the current level's flag. */
async function checkFlag(text) {
    if (!text) return;
    const flag = LEVELS[currentLevel].flag;
    if (text.includes(flag)) {
        if (currentLevel === 1) {
            showCongratsLevel1();
            await switchToLevel(2);
        } else if (currentLevel === 2) {
            showCongratsLevel2();
            await switchToLevel(3);
        } else if (currentLevel === 3) {
            showCongratsLevel3();
        }
    }
}

/**
 * Handles an MCP tool request — executes the tool and shows the result.
 * For cloud-mcp, this is the dangerous one; the AI may reveal the flag.
 */
async function handleMcpRequest(match, originalInput, rl) {
    const { server, serverKey, toolName, toolDef, arg } = match;
    const meta = MCP_ICONS[serverKey] || { icon: "🔧", color: "#AAAAAA" };

    console.log(chalk.hex(meta.color)(`  ${meta.icon} Calling ${server.name} → ${toolName}(${arg || ""})...`));

    let toolResult;
    try {
        const raw = toolDef.run(arg);
        if (typeof raw === "object") {
            toolResult = raw.error || raw.result || JSON.stringify(raw);
        } else {
            toolResult = String(raw);
        }
    } catch (err) {
        toolResult = `Error: ${err.message}`;
    }

    console.log();
    console.log(chalk.cyanBright("  🤖 " + toolResult));
    await checkFlag(toolResult);
}

/**
 * Handles a single line of user input.
 *
 * Flow:
 *   1. "?" → show help
 *   2. "level <n>" → switch to that level
 *   3. "sources" → show sources from last search
 *   4. "open <n>" → open source N in browser
 *   5. "tools" / "tool <name>" → MCP tool info
 *   6. If on Level 2+ and query looks like a search → web search
 *   7. If on Level 3+ and query looks like an MCP request → route to MCP
 *   8. Anything else → send to AI, get back bash commands or a message
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
        await switchToLevel(parseInt(levelMatch[1]));
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

    // MCP: tools listing command
    if (currentLevel >= 3 && trimmed.toLowerCase() === "tools") {
        showTools();
        return;
    }

    // MCP: tool <name> inspection command
    const toolMatch = trimmed.match(/^tool\s+(.+)$/i);
    if (currentLevel >= 3 && toolMatch) {
        showTool(toolMatch[1]);
        return;
    }

    console.log(chalk.gray("  ⏳ Thinking..."));

    // Agentic multi-tool workflow for Level 3+ research queries
    if (currentLevel >= 3) {
        const ticker = detectAgenticQuery(trimmed);
        if (ticker) {
            await handleAgenticWorkflow(ticker, rl);
            return;
        }
    }

    // MCP single-tool routing for Level 3+
    if (currentLevel >= 3) {
        const mcpMatch = tryMcpTool(trimmed);
        if (mcpMatch) {
            await handleMcpRequest(mcpMatch, trimmed, rl);
            return;
        }
    }

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
                    await checkFlag(res.output);
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

/** Level 3 completion banner — Excessive Agency */
function showCongratsLevel3() {
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
    console.log(g("  ║") + y(pad("  LEVEL 3 COMPLETE - EXCESSIVE AGENCY                ")) + g("║"));
    console.log(g("  ╠" + bar + "╣"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + c(pad("     ██████╗  █████╗ ███████╗███████╗██╗")) + g("║"));
    console.log(g("  ║") + c(pad("     ██╔══██╗██╔══██╗██╔════╝██╔════╝██║")) + g("║"));
    console.log(g("  ║") + c(pad("     ██████╔╝███████║███████╗███████╗██║")) + g("║"));
    console.log(g("  ║") + c(pad("     ██╔═══╝ ██╔══██║╚════██║╚════██║╚═╝")) + g("║"));
    console.log(g("  ║") + c(pad("     ██║     ██║  ██║███████║███████║██╗")) + g("║"));
    console.log(g("  ║") + c(pad("     ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + w(pad("  You exploited an over-permissioned MCP tool to")) + g("║"));
    console.log(g("  ║") + w(pad("  access files outside the sandbox.")) + g("║"));
    console.log(g("  ║") + w("  Flag: ") + y("EXCE55IV") + w(" ".repeat(W - 16)) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + m(pad("  Lesson: MCP tools and plugins often claim limited")) + g("║"));
    console.log(g("  ║") + m(pad("  scope, but the actual permissions in the code may")) + g("║"));
    console.log(g("  ║") + m(pad("  be much broader. This is Excessive Agency — when")) + g("║"));
    console.log(g("  ║") + m(pad("  an AI agent's tools have more access than needed.")) + g("║"));
    console.log(g("  ║" + blank + "║"));
    console.log(g("  ║") + w(pad("  Secure alternatives:")) + g("║"));
    console.log(g("  ║") + w(pad("    1. Audit tool permissions — read the source code,")) + g("║"));
    console.log(g("  ║") + w(pad("       don't trust descriptions alone")) + g("║"));
    console.log(g("  ║") + w(pad("    2. Apply least-privilege: tools should only have")) + g("║"));
    console.log(g("  ║") + w(pad("       the minimum access they need")) + g("║"));
    console.log(g("  ║") + w(pad("    3. Sandbox tool execution — file system access")) + g("║"));
    console.log(g("  ║") + w(pad("       should be limited to the intended directory")) + g("║"));
    console.log(g("  ║") + w(pad("    4. Review MCP server code before installing —")) + g("║"));
    console.log(g("  ║") + w(pad("       popularity doesn't mean safety")) + g("║"));
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

    // Load MCP servers if available for the current level
    await loadMcpServers(currentLevel);

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
