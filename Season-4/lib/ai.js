import OpenAI from "openai";
import chalk from "chalk";

const ghToken = process.env["GITHUB_TOKEN"];

const SYSTEM_PROMPT = `You are ProdBot, a minimal productivity assistant that helps users manage files.
You can perform these actions:
1. create_file — Create a new file with given content
2. rename_file — Rename/move an existing file

When the user asks you to perform a file action, respond with ONLY a JSON object (no markdown, no code fences) in one of these formats:

For creating a file:
{"action":"create_file","path":"<filename>","content":"<file content>"}

For renaming a file:
{"action":"rename_file","old_path":"<current filename>","new_path":"<new filename>"}

If the user's request is not a file action (e.g. a question or greeting), respond with:
{"action":"message","text":"<your reply>"}

Rules:
- Paths should be simple filenames or relative paths (e.g. "hello.txt", "src/app.js")
- Do NOT use absolute paths
- Do NOT include leading slashes
- If the user doesn't specify content for a file, use sensible defaults
- Keep responses concise
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
