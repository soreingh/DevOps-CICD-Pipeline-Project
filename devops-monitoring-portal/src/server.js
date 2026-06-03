/**
 * Production entry point — binds the app to a network port.
 * Tests import app.js directly and never load this file.
 */
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`DevOps Monitoring Portal running at http://localhost:${PORT}`);
});
