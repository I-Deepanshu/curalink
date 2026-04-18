/**
 * GET /api/sessions/:id        — single session with messages
 * GET /api/sessions/:id/history — full message history
 * DELETE /api/sessions/:id      — clear session
 */

import { Router } from 'express';
import Session from '../models/Session.js';
import Message from '../models/Message.js';

const router = Router();

// Get session + recent messages
router.get('/:id', async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const messages = await Message.find({ sessionId: session._id })
    .sort({ createdAt: 1 })
    .select('role content createdAt queryMeta -_id');

  res.json({ session, messages });
});

// Full message history with retrieved doc refs
router.get('/:id/history', async (req, res) => {
  const messages = await Message.find({ sessionId: req.params.id })
    .sort({ createdAt: 1 })
    .populate('retrievedDocs', 'title authors year source url')
    .populate('retrievedTrials', 'nctId title status');

  res.json({ messages });
});

// Clear session (start fresh)
router.delete('/:id', async (req, res) => {
  await Session.findByIdAndDelete(req.params.id);
  await Message.deleteMany({ sessionId: req.params.id });
  res.json({ ok: true });
});

export default router;
