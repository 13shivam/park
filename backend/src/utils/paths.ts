import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const PARK_ROOT = '.park-agent-launcher';

export function getParkRoot(): string {
  const homeDir = os.homedir();
  
  if (!homeDir) {
    throw new Error('Unable to determine user home directory');
  }
  
  return path.join(homeDir, PARK_ROOT);
}

export function getConfigDir(): string {
  return path.join(getParkRoot(), 'config');
}

export function getLogsDir(): string {
  return path.join(getParkRoot(), 'logs');
}

export function getUploadsDir(): string {
  return path.join(getParkRoot(), 'uploads');
}

export function getDbPath(): string {
  return path.join(getConfigDir(), 'park.db');
}

export function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function ensureDirectories(): void {
  const dirs = [
    getParkRoot(),
    getConfigDir(),
    getLogsDir(),
    getUploadsDir()
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Paths] Created directory: ${dir}`);
    }
  }
  
  console.log(`[Paths] Config directory: ${getConfigDir()}`);
}
