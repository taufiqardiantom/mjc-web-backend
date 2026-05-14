const { fromRequest } = require('../utils/logger');

function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  console.error(`[${status}] ${req.method} ${req.originalUrl} —`, err.message);

  // Log ke DB (fire-and-forget)
  fromRequest(req, err, status).catch(() => {});

  res.status(status).json({ message: err.message || 'Internal server error' });
}

module.exports = errorMiddleware;
