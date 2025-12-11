import * as fs from 'fs';
import { getConfigFilePath } from './paths';

export interface Config {
  server: {
    port: number;
    host: string;
  };
  shell: {
    defaultShell: string;
    defaultCwd: string;
  };
  ui: {
    defaultLayout: '1x1' | '2x2' | '3x3';
    theme: 'dark' | 'light';
  };
  monitoring: {
    watchedDirectories: string[];
  };
}

const DEFAULT_CONFIG: Config = {
  server: {
    port: 3000,
    host: 'localhost'
  },
  shell: {
    defaultShell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    defaultCwd: process.env.HOME || process.env.USERPROFILE || '~'
  },
  ui: {
    defaultLayout: '2x2',
    theme: 'dark'
  },
  monitoring: {
    watchedDirectories: []
  }
};

let currentConfig: Config;

export function loadConfig(): Config {
  const configPath = getConfigFilePath();
  
  if (!fs.existsSync(configPath)) {
    console.log('[Config] Creating default config at:', configPath);
    saveConfig(DEFAULT_CONFIG);
    currentConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }

  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    currentConfig = JSON.parse(data);
    console.log('[Config] Loaded from:', configPath);
    return currentConfig;
  } catch (error) {
    console.error('[Config] Failed to parse config, using defaults:', error);
    currentConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigFilePath();
  const tempPath = configPath + '.tmp';
  
  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tempPath, configPath);
    currentConfig = config;
    console.log('[Config] Saved to:', configPath);
  } catch (error) {
    console.error('[Config] Failed to save:', error);
    throw error;
  }
}

export function getConfig(): Config {
  return currentConfig || loadConfig();
}

export function updateConfig(partial: Partial<Config>): Config {
  const updated = { ...getConfig(), ...partial };
  saveConfig(updated);
  return updated;
}
