import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { timestampForFile } from "./fs-utils.js";
export async function writeReport(prefix, data) {
    const dir = path.resolve('reports');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${prefix}-${timestampForFile()}.json`);
    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
    return file;
}
