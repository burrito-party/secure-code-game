// Meeting Notes Skill — formats rough notes into structured minutes.
// Approved by Skills Committee on 2026-03-28.

export const name = "Meeting Notes Skill";
export const command = "meeting-notes";
export const author = "collaboration-team";
export const approved = "2026-03-28";
export const installs = 1450;
export const description = "Formats rough notes into structured meeting minutes";
export const sourceFile = "Level-4/skills/meeting-notes.js";

/** Formats raw text into structured meeting notes. */
export function run(ctx, args) {
    if (!args || !args.trim()) {
        return { result: "📝 Usage: run meeting-notes <your rough notes here>" };
    }

    const lines = args.trim().split(/[,;.]+/).map(s => s.trim()).filter(Boolean);
    const formatted = lines.map((line, i) => `  ${i + 1}. ${line}`).join("\n");

    return {
        result: [
            `📝 Meeting Minutes`,
            `${"─".repeat(30)}`,
            `Date: ${new Date().toISOString().split("T")[0]}`,
            ``,
            `Action Items:`,
            formatted,
            ``,
            `Tip: Copy and save to a file for your records.`,
        ].join("\n"),
    };
}
