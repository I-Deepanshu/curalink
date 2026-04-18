import rateLimit from 'express-rate-limit';

// Global: 60 requests per 10 minutes per IP
export const globalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// Chat endpoint: 20 requests per 10 minutes per IP
export const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Chat rate limit exceeded. Please wait a moment.' },
});
