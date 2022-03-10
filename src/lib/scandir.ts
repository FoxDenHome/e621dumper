import { readdir } from 'fs/promises';
import { resolve } from 'path';

export async function readdirRecursive(root: string, result: Set<string> = new Set<string>()): Promise<Set<string>> {
    const files = await readdir(root, {
        withFileTypes: true,
    });

    for (const file of files) {
        if (file.name[0] === '.') {
            continue;
        }
        const path = resolve(root, file.name);
        if (file.isDirectory()) {
            await readdirRecursive(path, result);
        } else if (file.isFile()) {
            result.add(path);
        }
    }
    return result;
}
