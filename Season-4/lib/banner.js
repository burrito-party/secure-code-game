import chalk from "chalk";

export function showBanner() {
    const cyan = chalk.cyanBright;
    const magenta = chalk.hex("#FF00FF");
    const green = chalk.hex("#20C20E");
    const white = chalk.whiteBright;

    const art = `
${white("  Welcome to")}
${cyan(" ██████╗ ██████╗  ██████╗ ██████╗ ██████╗  ██████╗ ████████╗")}
${cyan(" ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝")}
${cyan(" ██████╔╝██████╔╝██║   ██║██║  ██║██████╔╝██║   ██║   ██║   ")}
${cyan(" ██╔═══╝ ██╔══██╗██║   ██║██║  ██║██╔══██╗██║   ██║   ██║   ")}
${cyan(" ██║     ██║  ██║╚██████╔╝██████╔╝██████╔╝╚██████╔╝   ██║   ")}
${cyan(" ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝  ╚═════╝    ╚═╝   ")}
                                                          ${magenta("  ╔══╗")}
                                                          ${magenta("  ║")}${green("▓▓")}${magenta("║")}
                                                          ${magenta("  ╠══╣")}
                                                          ${magenta("  ║")}${green("██")}${magenta("║")}
                                                          ${magenta("  ╚══╝")}
${white("                    CLI Version 1.0.0")}
`;
    console.log(art);
}
