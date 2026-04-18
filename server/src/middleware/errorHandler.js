/**
 * Centralised error handler — must be registered LAST in Express.
 */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  console.error(`[Error] ${status} — ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
