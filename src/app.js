require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { getPool }        = require('./config/database');
const ppmChecklistRoutes  = require('./routes/support/ppm/checklist.routes');
const logsRoutes          = require('./routes/logs.routes');
const customerRoutes      = require('./routes/marketing/customer.routes');
const plafonRoutes        = require('./routes/marketing/plafon.routes');
const frppRoutes          = require('./routes/marketing/frpp.routes');
const sphRoutes           = require('./routes/marketing/sph.routes');
const perwakilanRoutes    = require('./routes/marketing/perwakilan.routes');
const errorMiddleware    = require('./middleware/error.middleware');

const app = express();

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.GATEWAY_URL  || 'http://localhost:3000',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

app.use((req, _res, next) => { req._startTime = Date.now(); next(); });

// Gateway strips /api prefix before proxying — routes here are path-after-/api
app.use('/support/ppm/checklist',   ppmChecklistRoutes);
app.use('/logs',                    logsRoutes);
app.use('/marketing/customer',      customerRoutes);
app.use('/marketing/plafon',        plafonRoutes);
app.use('/marketing/frpp',          frppRoutes);
app.use('/marketing/sph',           sphRoutes);
app.use('/marketing/perwakilan',    perwakilanRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_error', message: 'Database tidak dapat dihubungi' });
  }
});

app.use(errorMiddleware);

module.exports = app;
