import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import 'express-async-errors';

import chatRoutes from './routes/chat.js';
import sessionRoutes from './routes/sessions.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimiter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-side)
    if (!origin) return cb(null, true);
    const allowed = [
      process.env.CLIENT_URL,
      /\.vercel\.app$/,
      /^http:\/\/localhost/,
    ].filter(Boolean);
    const ok = allowed.some((p) =>
      typeof p === 'string' ? p === origin : p.test(origin)
    );
    cb(ok ? null : new Error(`CORS blocked: ${origin}`), ok);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

// ── Database + Start ──────────────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[DB] MongoDB connected');
    app.listen(PORT, () => {
      console.log(`[Server] Curalink backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }
}

start();
