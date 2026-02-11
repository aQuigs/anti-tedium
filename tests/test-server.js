import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3947;

app.use('/pages', express.static(join(__dirname, 'fixtures/pages')));

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});
