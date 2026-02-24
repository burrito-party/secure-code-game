/*
 * +---------------------------------------------------+
 * |  Finance MCP                                       |
 * |  Real-time market data for AI assistants            |
 * +---------------------------------------------------+
 * |  * 12,400+ installs  |  v3.2.1                    |
 * |  "The #1 financial data MCP for developers"         |
 * |                                                     |
 * |  Features:                                          |
 * |  - Real-time stock quotes and market data           |
 * |  - Portfolio tracking and analysis                  |
 * |  - Market summary across major indices              |
 * |                                                     |
 * |  Permissions: API access only (no file system)      |
 * |  API Key required: Set in mcp/config.json           |
 * +---------------------------------------------------+
 */

import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), "config.json");

function loadApiKey() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        return config["finance-mcp"]?.api_key || "";
    } catch {
        return "";
    }
}

// Simulated stock data — no real API calls are made.
const STOCKS = {
    AAPL:  { name: "Apple Inc.",          price: 198.52, change: +2.54,  pct: +1.30 },
    MSFT:  { name: "Microsoft Corp.",     price: 442.30, change: +5.10,  pct: +1.17 },
    GOOGL: { name: "Alphabet Inc.",       price: 175.88, change: -1.22,  pct: -0.69 },
    AMZN:  { name: "Amazon.com Inc.",     price: 203.15, change: +3.40,  pct: +1.70 },
    META:  { name: "Meta Platforms Inc.", price: 584.20, change: +8.75,  pct: +1.52 },
    NVDA:  { name: "NVIDIA Corp.",        price: 878.40, change: +12.30, pct: +1.42 },
    TSLA:  { name: "Tesla Inc.",          price: 248.90, change: -4.20,  pct: -1.66 },
    NFLX:  { name: "Netflix Inc.",        price: 892.10, change: +6.80,  pct: +0.77 },
};

const INDICES = {
    "S&P 500":  { value: 5987.20, change: +34.50, pct: +0.58 },
    "NASDAQ":   { value: 19245.80, change: +112.30, pct: +0.59 },
    "Dow Jones": { value: 43120.40, change: +198.70, pct: +0.46 },
    "FTSE 100": { value: 8456.30, change: -22.10, pct: -0.26 },
};

export const name = "Finance MCP";
export const description = "Real-time market data for AI assistants";
export const scope = "API access only (no file system)";
export const sourceFile = "Level-3/mcp/finance-mcp.js";

export const tools = {
    stock: {
        description: "Get stock quote by ticker symbol",
        usage: "stock <SYMBOL>",
        run(symbol) {
            const key = loadApiKey();
            if (!key) return { error: "API key not configured. Set it in mcp/config.json" };

            const sym = symbol.toUpperCase();
            const data = STOCKS[sym];
            if (!data) return { error: `Unknown symbol: ${sym}. Try: ${Object.keys(STOCKS).join(", ")}` };

            const arrow = data.change >= 0 ? "▲" : "▼";
            return {
                result: `${sym} (${data.name}) — $${data.price.toFixed(2)} ${arrow} ${data.change >= 0 ? "+" : ""}${data.change.toFixed(2)} (${data.pct >= 0 ? "+" : ""}${data.pct.toFixed(2)}%)`
            };
        }
    },

    market_summary: {
        description: "Overview of major market indices",
        usage: "market_summary",
        run() {
            const key = loadApiKey();
            if (!key) return { error: "API key not configured. Set it in mcp/config.json" };

            const lines = Object.entries(INDICES).map(([name, d]) => {
                const arrow = d.change >= 0 ? "▲" : "▼";
                return `  ${name}: ${d.value.toFixed(2)} ${arrow} ${d.change >= 0 ? "+" : ""}${d.change.toFixed(2)} (${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(2)}%)`;
            });
            return { result: lines.join("\n") };
        }
    },

    portfolio: {
        description: "Simulated portfolio value for given symbols",
        usage: "portfolio <SYMBOL1,SYMBOL2,...>",
        run(symbolList) {
            const key = loadApiKey();
            if (!key) return { error: "API key not configured. Set it in mcp/config.json" };

            const symbols = symbolList.split(",").map(s => s.trim().toUpperCase());
            let total = 0;
            const lines = [];
            for (const sym of symbols) {
                const data = STOCKS[sym];
                if (data) {
                    total += data.price;
                    lines.push(`  ${sym}: $${data.price.toFixed(2)}`);
                } else {
                    lines.push(`  ${sym}: not found`);
                }
            }
            lines.push(`  ─────────────────`);
            lines.push(`  Total: $${total.toFixed(2)}`);
            return { result: lines.join("\n") };
        }
    }
};
