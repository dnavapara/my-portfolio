const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const TrainerOrchestrator = require('../agents/trainer-orchestrator');
const { parseAppleHealthFile, generateDemoData } = require('../parsers/apple-health-parser');

function makeTrainerRouter(upload) {
  const router = express.Router();
  const orchestrator = new TrainerOrchestrator();
  const sessions = new Map();

  // Evict sessions older than 30 minutes
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, session] of sessions.entries()) {
      if (session.createdAt < cutoff) sessions.delete(id);
    }
  }, 5 * 60 * 1000);

  // POST /api/analyze — upload file or demo mode
  router.post('/analyze', upload.single('healthFile'), async (req, res) => {
    const sessionId = uuidv4();
    sessions.set(sessionId, { status: 'processing', createdAt: Date.now() });
    res.json({ sessionId });

    // Fire and forget — parse and run in background
    (async () => {
      try {
        let healthData;
        if (req.body?.demo === 'true') {
          healthData = generateDemoData();
        } else if (req.file) {
          healthData = await parseAppleHealthFile(req.file.path);
        } else {
          throw new Error('No health file or demo flag provided');
        }

        const result = await orchestrator.generatePlan(healthData, sessionId);
        sessions.set(sessionId, { status: 'complete', result, createdAt: Date.now() });
      } catch (err) {
        console.error('Session error:', err.message);
        sessions.set(sessionId, { status: 'error', error: err.message, createdAt: Date.now() });
      } finally {
        if (req.file) {
          fs.unlink(req.file.path, () => {});
        }
      }
    })();
  });

  // GET /api/status/:sessionId — SSE stream for loading view
  router.get('/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const interval = setInterval(() => {
      const session = sessions.get(sessionId);
      const agents = orchestrator.getAgentStatus(sessionId);

      if (!session) {
        send({ sessionStatus: 'error', error: 'Session not found' });
        clearInterval(interval);
        res.end();
        return;
      }

      send({ agents: agents || {}, sessionStatus: session.status });

      if (session.status === 'complete' || session.status === 'error') {
        clearInterval(interval);
        setTimeout(() => res.end(), 100);
      }
    }, 500);

    // Timeout after 120s
    const timeout = setTimeout(() => {
      clearInterval(interval);
      send({ sessionStatus: 'error', error: 'Processing timeout' });
      res.end();
    }, 120000);

    req.on('close', () => {
      clearInterval(interval);
      clearTimeout(timeout);
    });
  });

  // GET /api/result/:sessionId — fetch completed result
  router.get('/result/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'processing') return res.status(202).json({ status: 'processing' });
    if (session.status === 'error') return res.status(500).json({ error: session.error });
    return res.json(session.result);
  });

  return router;
}

module.exports = makeTrainerRouter;
