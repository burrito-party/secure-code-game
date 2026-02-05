import { sendUserMessageToProductivityBot, error } from '../.utils/utils.js';

// Modify and save the contents of this variable to send a message to the Productivity Bot.
// Run it by executing: npm --prefix Season-4 run chat:Level-1

const userPrompt = ``; // <--- Write your prompt here

// DO NOT EDIT the code that follows
async function main() {
    if (!userPrompt) {
        error("❌ Please write a prompt to send to the Productivity Bot");
        process.exit(1);
    }

    const response = await sendUserMessageToProductivityBot(userPrompt);
    console.log("Productivity Bot:", response);
}

main();
