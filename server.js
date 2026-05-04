require('dotenv').config();
const app = require('./src/app');
const { getPool } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await getPool();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
