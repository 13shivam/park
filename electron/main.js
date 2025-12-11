const { app, BrowserWindow, Tray, Menu } = require('electron');
const { spawn, fork } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Setup logging
const logDir = path.join(os.homedir(), '.park-agent-launcher', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const electronLogFile = path.join(logDir, `electron-${Date.now()}.log`);
const electronLogStream = fs.createWriteStream(electronLogFile, { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  const msg = args.join(' ');
  originalConsoleLog(...args);
  electronLogStream.write(`[LOG] ${new Date().toISOString()} ${msg}\n`);
};

console.error = (...args) => {
  const msg = args.join(' ');
  originalConsoleError(...args);
  electronLogStream.write(`[ERROR] ${new Date().toISOString()} ${msg}\n`);
};

console.log('[Electron] Logging to:', electronLogFile);

let mainWindow = null;
let backendProcess = null;
let tray = null;
const BACKEND_PORT = 3000;
const MAX_RESTART_ATTEMPTS = 3;
let restartAttempts = 0;
let isShuttingDown = false;

const isDev = !app.isPackaged;

// Fail-safe: Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Exiting.');
  app.quit();
}

function getBackendPath() {
  if (isDev) {
    return path.join(__dirname, '../backend/dist/server.js');
  }
  return path.join(process.resourcesPath, 'app/backend/dist/server.js');
}

function startBackend() {
  // Fail-safe: Prevent restart loop
  if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
    console.error('[Electron] Max restart attempts reached. Backend will not restart.');
    return;
  }
  
  if (isShuttingDown) {
    console.log('[Electron] Shutting down, not starting backend.');
    return;
  }

  const backendPath = getBackendPath();
  
  // Fail-safe: Verify backend file exists
  if (!fs.existsSync(backendPath)) {
    console.error('[Electron] Backend file not found:', backendPath);
    return;
  }
  
  console.log('[Electron] Starting backend:', backendPath);
  console.log('[Electron] User home:', os.homedir());
  console.log('[Electron] Expected DB path:', path.join(os.homedir(), '.park-agent-launcher', 'config', 'park.db'));
  console.log('[Electron] isDev:', isDev);
  console.log('[Electron] Restart attempt:', restartAttempts + 1);
  
  const env = {
    ...process.env,
    HOME: os.homedir(),
    NODE_ENV: 'production',
    PORT: BACKEND_PORT
  };
  
  try {
    // Use fork instead of spawn to properly run Node.js scripts
    // fork uses the Node.js executable that comes with Electron
    backendProcess = fork(backendPath, [], {
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      silent: true
    });
    
    restartAttempts++;
    
    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });
    
    backendProcess.on('error', (error) => {
      console.error('[Backend] Failed to start:', error);
      if (!isShuttingDown && restartAttempts < MAX_RESTART_ATTEMPTS) {
        console.log('[Backend] Attempting restart in 3 seconds...');
        setTimeout(startBackend, 3000);
      }
    });
    
    backendProcess.on('exit', (code, signal) => {
      console.log(`[Backend] Process exited with code ${code}, signal ${signal}`);
      backendProcess = null;
      
      // Only restart if not shutting down and exit was unexpected
      if (!isShuttingDown && code !== 0 && restartAttempts < MAX_RESTART_ATTEMPTS) {
        console.log('[Backend] Unexpected exit, attempting restart in 3 seconds...');
        setTimeout(startBackend, 3000);
      }
    });
    
    // Reset restart counter on successful run after 30 seconds
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        console.log('[Backend] Running successfully, resetting restart counter');
        restartAttempts = 0;
      }
    }, 30000);
    
  } catch (error) {
    console.error('[Electron] Failed to spawn backend:', error);
  }
}

function createWindow() {
  // Fail-safe: Don't create window if shutting down
  if (isShuttingDown) {
    console.log('[Electron] Shutting down, not creating window.');
    return;
  }
  
  // Fail-safe: Don't create multiple windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[Electron] Window already exists.');
    mainWindow.show();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'PARK - Agent Launcher',
    icon: path.join(__dirname, '../resources/icon.icns'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  // Wait for backend to be ready before loading
  const checkBackend = async () => {
    try {
      const response = await fetch(`http://localhost:${BACKEND_PORT}/api/system/config`);
      if (response.ok && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`).catch(err => {
          console.error('[Electron] Failed to load URL:', err);
        });
      }
    } catch (err) {
      // Backend not ready, retry
      setTimeout(checkBackend, 200);
    }
  };
  
  setTimeout(checkBackend, 500);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting && !isShuttingDown) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== `http://localhost:${BACKEND_PORT}`) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  createTray();
  createMenu();
}

function createTray() {
  // Fail-safe: Don't create tray if already exists
  if (tray && !tray.isDestroyed()) {
    console.log('[Electron] Tray already exists.');
    return;
  }

  const iconPath = path.join(__dirname, '../resources/icon.png');
  
  // Fail-safe: Check if icon exists
  if (!fs.existsSync(iconPath)) {
    console.error('[Electron] Tray icon not found:', iconPath);
    return;
  }
  
  try {
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show PARK',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          isShuttingDown = true;
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('PARK Agent Launcher');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (error) {
    console.error('[Electron] Failed to create tray:', error);
  }
}

function createMenu() {
  const template = [
    {
      label: 'PARK',
      submenu: [
        { 
          label: 'About PARK',
          click: () => {
            const { dialog, shell } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About PARK',
              message: 'PARK - Parallel Agent Runtime for Kiro',
              detail: 'Version 1.0.0\n\nMaintainer: github.com/13shivam\n\nContribute or raise issues:\ngithub.com/13shivam/park',
              buttons: ['Close', 'Open GitHub'],
              defaultId: 0,
              cancelId: 0
            }).then(result => {
              if (result.response === 1) {
                shell.openExternal('https://github.com/13shivam/park');
              }
            });
          }
        },
        { type: 'separator' },
        { 
          label: 'Quit',
          click: () => {
            app.isQuitting = true;
            isShuttingDown = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle second instance
app.on('second-instance', () => {
  console.log('[Electron] Second instance detected, focusing existing window.');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  console.log('[Electron] App ready, starting...');
  
  try {
    startBackend();
    createWindow();
  } catch (error) {
    console.error('[Electron] Failed to start app:', error);
    app.quit();
  }
  
  app.on('activate', () => {
    if (isShuttingDown) return;
    
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  console.log('[Electron] All windows closed, keeping app in tray.');
});

app.on('before-quit', () => {
  console.log('[Electron] App quitting...');
  app.isQuitting = true;
  isShuttingDown = true;
  
  if (backendProcess && !backendProcess.killed) {
    console.log('[Electron] Stopping backend...');
    try {
      backendProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          console.log('[Electron] Force killing backend...');
          backendProcess.kill('SIGKILL');
        }
      }, 5000);
    } catch (error) {
      console.error('[Electron] Error stopping backend:', error);
    }
  }
});

// Fail-safe: Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Electron] Uncaught exception:', error);
  // Don't quit, just log
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Electron] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't quit, just log
});
