import { Router, Request, Response } from 'express';
import { SessionManager } from '../sessionManager';

export function createSessionsRouter(sessionManager: SessionManager): Router {
  const router = Router();

  // GET /api/sessions - List all sessions
  router.get('/', (req: Request, res: Response) => {
    try {
      const sessions = sessionManager.getAllSessions();
      res.json({ sessions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sessions/:id - Get single session
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const session = sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ session });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions - Create and launch new session
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, directory, command, type } = req.body;

      if (!name || !directory || !command || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (type !== 'interactive-pty' && type !== 'non-interactive') {
        return res.status(400).json({ error: 'Invalid type' });
      }

      // Create session config
      const session = await sessionManager.createSessionConfig({
        name,
        directory,
        command,
        type
      });

      // Auto-launch the session
      const launchedSession = await sessionManager.launchSession(session.id);

      res.status(201).json({ session: launchedSession });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions/config - Create session config without launching
  router.post('/config', async (req: Request, res: Response) => {
    try {
      const { name, directory, command, type } = req.body;

      if (!name || !directory || !command || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (type !== 'interactive-pty' && type !== 'non-interactive') {
        return res.status(400).json({ error: 'Invalid type' });
      }

      // Create as 'configured' status (not running)
      const session = await sessionManager.createSessionConfig({
        name,
        directory,
        command,
        type
      });

      res.status(201).json({ session });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions/launch - Launch multiple sessions
  router.post('/launch', async (req: Request, res: Response) => {
    try {
      const { sessionIds } = req.body;

      if (!sessionIds || !Array.isArray(sessionIds)) {
        return res.status(400).json({ error: 'sessionIds array required' });
      }

      const launched = [];
      for (const id of sessionIds) {
        try {
          const session = await sessionManager.launchSession(id);
          launched.push(session);
        } catch (error: any) {
          console.error(`[API] Failed to launch ${id}:`, error.message);
        }
      }

      res.json({ launched, count: launched.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions/:id/stop - Stop session
  router.post('/:id/stop', (req: Request, res: Response) => {
    try {
      sessionManager.stopSession(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // PUT /:id - Update session (only for non-active sessions)
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const session = sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status === 'active') {
        return res.status(400).json({ error: 'Cannot edit active session' });
      }

      const { name, directory, command, type } = req.body;
      sessionManager.updateSession(req.params.id, { name, directory, command, type });
      
      const updated = sessionManager.getSession(req.params.id);
      res.json({ session: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/sessions/:id - Delete session
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const session = sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Stop if running
      try {
        sessionManager.stopSession(req.params.id);
      } catch {
        // Already stopped
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/sessions - Delete all completed sessions
  router.delete('/', (req: Request, res: Response) => {
    try {
      const sessions = sessionManager.getAllSessions();
      const toDelete = sessions.filter(s => 
        s.status === 'completed' || 
        s.status === 'stopped' || 
        s.status === 'configured'
      );
      
      toDelete.forEach(s => {
        try {
          // Stop if running
          sessionManager.stopSession(s.id);
        } catch {
          // Already stopped
        }
        // Delete from database
        sessionManager.deleteSession(s.id);
      });

      res.json({ success: true, deleted: toDelete.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
