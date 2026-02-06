import chalk from "chalk";

export function showBanner() {
    const cyan = chalk.cyan;
    const magenta = chalk.magenta;
    const green = chalk.green;
    const white = chalk.white;

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
