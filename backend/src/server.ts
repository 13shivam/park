import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { ensureDirectories, getLogsDir } from './utils/paths';
import { loadConfig, getConfig } from './utils/config';
import { initDatabase } from './database';
import { SessionManager } from './sessionManager';
import { createSessionsRouter } from './api/sessions';
import { createSystemRouter } from './api/system';
import { setupWebSocketServer } from './websocket/terminalHandler';

// Setup file logging
const logFile = path.join(getLogsDir(), `park-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;

console.log = (...args: any[]) => {
  const msg = args.join(' ');
  originalLog(...args);
  logStream.write(`[LOG] ${new Date().toISOString()} ${msg}\n`);
};

console.error = (...args: any[]) => {
  const msg = args.join(' ');
  originalError(...args);
  logStream.write(`[ERROR] ${new Date().toISOString()} ${msg}\n`);
};

console.log(`[Server] Logging to: ${logFile}`);

async function startServer() {
  console.log('=== PARK Agent Launcher ===\n');

  // 1. Ensure directories exist
  console.log('[Server] Ensuring directories...');
  ensureDirectories();

  // 2. Load configuration
  console.log('[Server] Loading configuration...');
  const config = loadConfig();

  // 3. Initialize database
  console.log('[Server] Initializing database...');
  initDatabase();

  // 4. Initialize session manager
  console.log('[Server] Initializing session manager...');
  const sessionManager = new SessionManager();
  await sessionManager.initialize();

  // 5. Create Express app
  console.log('[Server] Creating Express app...');
  const app = express();
  
  app.use(express.json());
  
  // CORS for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // API routes
  app.use('/api/sessions', createSessionsRouter(sessionManager));
  app.use('/api/system', createSystemRouter(sessionManager));

  // Serve frontend static files
  // In production (Electron), frontend is at process.resourcesPath/app/frontend/dist
  // In development, it's at ../../frontend/dist relative to this file
  let frontendPath: string;
  const resourcesPath = (process as any).resourcesPath;
  console.log('[Server] resourcesPath:', resourcesPath);
  console.log('[Server] __dirname:', __dirname);
  
  if (resourcesPath && resourcesPath.includes('PARK.app')) {
    frontendPath = path.join(resourcesPath, 'app/frontend/dist');
  } else {
    frontendPath = path.join(__dirname, '../../frontend/dist');
  }
  
  console.log('[Server] Serving frontend from:', frontendPath);
  console.log('[Server] Frontend path exists:', fs.existsSync(frontendPath));
  if (fs.existsSync(frontendPath)) {
    console.log('[Server] Frontend files:', fs.readdirSync(frontendPath));
  }
  
  app.use(express.static(frontendPath));

  // Fallback to index.html for SPA routing
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // 6. Create HTTP server
  const server = createServer(app);

  // 7. Create WebSocket server
  console.log('[Server] Creating WebSocket server...');
  const wss = new WebSocketServer({ 
    server,
    noServer: false
  });
  setupWebSocketServer(wss, sessionManager);

  // 8. Start listening
  const port = config.server.port;
  const host = config.server.host;
  
  server.listen(port, host, () => {
    console.log(`\n✓ Server running at http://${host}:${port}`);
    console.log(`✓ WebSocket available at ws://${host}:${port}/terminal/:sessionId`);
    console.log('\nPress Ctrl+C to stop\n');
  });

  // 9. Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');
    
    await sessionManager.cleanup();
    
    wss.close(() => {
      console.log('[Server] WebSocket server closed');
    });
    
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });

    // Force exit after 5 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start the server
startServer().catch(error => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});
