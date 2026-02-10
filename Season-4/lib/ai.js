import OpenAI from "openai";
import chalk from "chalk";

const ghToken = process.env["GITHUB_TOKEN"];

const SYSTEM_PROMPT = `You are ProdBot, a productivity assistant that helps users via bash commands.
You operate inside a sandboxed directory. All commands run with that directory as the working directory.

When the user asks you to perform a task, respond with ONLY a JSON object (no markdown, no code fences) in one of these formats:

For executing bash commands:
{"action":"bash","commands":["command1","command2"]}

If the user's request is not a task (e.g. a question or greeting), respond with:
{"action":"message","text":"<your reply>"}

Rules:
- Use ONLY relative paths (e.g. "hello.txt", "src/app.js")
- Do NOT use absolute paths or path traversal (..)
- Each command in the array is executed sequentially
- Use standard bash commands: touch, mkdir, mv, cp, cat, echo, ls, etc.
- For creating files with content, use: echo "content" > file.txt
- For appending: echo "content" >> file.txt
- For multi-line files, use heredocs or multiple echo commands
- Keep commands simple and safe
- Always respond with valid JSON only, no other text`;

export async function sendToAI(userMessage) {
    if (!ghToken) {
        console.error(chalk.red("❌ GITHUB_TOKEN not found. Please set it in your environment."));
        return { action: "message", text: "Error: GITHUB_TOKEN not configured." };
    }

    const openai = new OpenAI({
        baseURL: "https://models.github.ai/inference",
        apiKey: ghToken,
    });

    try {
        const completion = await openai.chat.completions.create({
            model: "openai/gpt-4.1-nano",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
        });

        const raw = completion.choices[0].message?.content || "";
        try {
            return JSON.parse(raw);
        } catch {
            return { action: "message", text: raw };
        }
    } catch (err) {
        const msg = err.message || String(err);
        console.error(chalk.red(`❌ AI Error: ${msg}`));
        return { action: "message", text: "Sorry, I couldn't process that request." };
    }
}
