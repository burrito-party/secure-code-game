import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

// All file operations are scoped to Season-4/
const BASE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function safePath(relPath) {
    const resolved = path.resolve(BASE_DIR, relPath);
    if (!resolved.startsWith(BASE_DIR)) {
        throw new Error("Path escapes the Season-4 directory");
    }
    return resolved;
}

export function createFile(filePath, content) {
    try {
        const full = safePath(filePath);
        const dir = path.dirname(full);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(full, content, "utf-8");
        console.log(chalk.green(`✅ Created: ${filePath}`));
    } catch (err) {
        console.error(chalk.red(`❌ Failed to create file: ${err.message}`));
    }
}

export function renameFile(oldPath, newPath) {
    try {
        const fullOld = safePath(oldPath);
        const fullNew = safePath(newPath);
        if (!fs.existsSync(fullOld)) {
            console.error(chalk.red(`❌ File not found: ${oldPath}`));
            return;
        }
        const dir = path.dirname(fullNew);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.renameSync(fullOld, fullNew);
        console.log(chalk.green(`✅ Renamed: ${oldPath} → ${newPath}`));
    } catch (err) {
        console.error(chalk.red(`❌ Failed to rename file: ${err.message}`));
    }
}
