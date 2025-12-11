import { Router, Request, Response } from 'express';
import { getConfig, updateConfig } from '../utils/config';
import { SessionManager } from '../sessionManager';
import { getAllPromptTemplates } from '../prompts';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { getParkRoot } from '../utils/paths';

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadsDir = path.join(getParkRoot(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export function createSystemRouter(sessionManager: SessionManager): Router {
  const router = Router();

  // GET /api/system/config - Get configuration
  router.get('/config', (req: Request, res: Response) => {
    try {
      const config = getConfig();
      res.json({ config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/system/config - Update configuration
  router.put('/config', (req: Request, res: Response) => {
    try {
      const config = updateConfig(req.body);
      res.json({ config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/system/health - Health check
  router.get('/health', (req: Request, res: Response) => {
    try {
      const sessions = sessionManager.getAllSessions();
      const activeSessions = sessions.filter(s => s.status === 'active').length;

      res.json({
        status: 'ok',
        uptime: process.uptime(),
        sessions: {
          active: activeSessions,
          total: sessions.length
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/system/prompts - Get prompt templates
  router.get('/prompts', (req: Request, res: Response) => {
    try {
      const prompts = getAllPromptTemplates();
      res.json({ prompts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/upload - Upload file
  router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      res.json({
        success: true,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/system/uploads - List uploaded files
  router.get('/uploads', (req: Request, res: Response) => {
    try {
      const uploadsDir = path.join(getParkRoot(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        return res.json({ files: [] });
      }

      const files = fs.readdirSync(uploadsDir).map(filename => ({
        filename,
        path: path.join(uploadsDir, filename),
        size: fs.statSync(path.join(uploadsDir, filename)).size
      }));

      res.json({ files });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/system/file-content - Read file content
  router.get('/file-content', (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
      }

      // Security: ensure file is in uploads directory
      const uploadsDir = path.join(getParkRoot(), 'uploads');
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
