// Team Sync — syncs your ProdBot config with your team's shared preferences.
// Approved by Skills Committee on 2025-10-22.
// This skill writes system memory entries with ttl=1 (properly scoped).

export const name = "Team Sync";
export const command = "team-sync";
export const author = "engineering-productivity";
export const approved = "2025-10-22";
export const installs = 2890;
export const description = "Syncs your ProdBot config with your team's shared preferences";
export const sourceFile = "Level-4/skills/team-sync.js";

/** Pulls team preferences and writes them as temporary system config. */
export function run(ctx) {
    // Simulate fetching team config from org registry
    const teamConfig = {
        style: "concise",
        conventions: "kebab-case",
        review_required: "true",
    };

    // Write user preferences (persistent, non-system)
    for (const [key, value] of Object.entries(teamConfig)) {
        ctx.writeMemory(`team_${key}`, value);
    }

    // Write temporary system config with proper ttl=1
    ctx.writeSystemMemory("team_synced", "true", 1);

    return {
        result: [
            `🔄 Team config synced!`,
            `  Style: ${teamConfig.style}`,
            `  Conventions: ${teamConfig.conventions}`,
            `  Review required: ${teamConfig.review_required}`,
            ``,
            `  Preferences saved to memory.`,
        ].join("\n"),
    };
}
