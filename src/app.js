require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const roleRoutes = require('./routes/role.routes');
const menuRoutes = require('./routes/menu.routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/menus', menuRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorMiddleware);

module.exports = app;
