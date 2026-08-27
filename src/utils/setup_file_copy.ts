import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from './logger';

export type CopyStats = { copied: number; skipped: number };

export function copySetupFile(source: string, destination: string, displaySource: string, displayDestination: string): CopyStats {
  if (!fs.existsSync(source)) return { copied: 0, skipped: 0 };
  if (fs.existsSync(destination)) {
    logInfo(`  ⏭️  ${displayDestination} already exists; skipping.`);
    return { copied: 0, skipped: 1 };
  }
  fs.copyFileSync(source, destination);
  logInfo(`  ✅ Copied ${displaySource} → ${displayDestination}`);
  return { copied: 1, skipped: 0 };
}

export function copySetupDirectory(
  sourceDirectory: string,
  destinationDirectory: string,
  fileFilter: (fileName: string) => boolean,
  displayDirectory: string,
): CopyStats {
  if (!fs.existsSync(sourceDirectory)) return { copied: 0, skipped: 0 };
  return fs.readdirSync(sourceDirectory)
    .filter(fileFilter)
    .filter((fileName) => fs.statSync(path.join(sourceDirectory, fileName)).isFile())
    .map((fileName) => copySetupFile(
      path.join(sourceDirectory, fileName),
      path.join(destinationDirectory, fileName),
      `${displayDirectory}/${fileName}`,
      `${displayDirectory.replace('setup/', '.github/')}/${fileName}`,
    ))
    .reduce((total, current) => ({
      copied: total.copied + current.copied,
      skipped: total.skipped + current.skipped,
    }), { copied: 0, skipped: 0 });
}
