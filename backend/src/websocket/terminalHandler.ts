import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { SessionManager } from '../sessionManager';

export function setupWebSocketServer(wss: WebSocketServer, sessionManager: SessionManager): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url || '';
    // Extract session ID from /terminal/:sessionId
    const match = url.match(/\/terminal\/([^\/]+)/);
    const sessionId = match ? match[1] : null;

    if (!sessionId) {
      ws.send(JSON.stringify({ type: 'error', message: 'No session ID provided' }));
      ws.close();
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
      ws.close();
      return;
    }

    console.log(`[WebSocket] Client connected to session ${sessionId}`);

    // Attach client to session
    sessionManager.attachClient(sessionId, ws);

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'input':
            sessionManager.sendInput(sessionId, message.data);
            break;

          case 'resize':
            if (message.cols && message.rows) {
              sessionManager.resizePTY(sessionId, message.cols, message.rows);
            }
            break;

          default:
            console.warn(`[WebSocket] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected from session ${sessionId}`);
      sessionManager.detachClient(sessionId, ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Error on session ${sessionId}:`, error);
      sessionManager.detachClient(sessionId, ws);
    });
  });

  console.log('[WebSocket] Server initialized');
}
