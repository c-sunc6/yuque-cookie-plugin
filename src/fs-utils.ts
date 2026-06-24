import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true })
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`)
}

export function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-')
}
