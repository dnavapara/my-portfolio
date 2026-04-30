const express = require('express');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const makeTrainerRouter = require('./routes/trainer');

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (_req, _file, cb) => cb(null, uuidv4() + '.xml'),
  }),
  limits: { fileSize: 600 * 1024 * 1024 },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api', makeTrainerRouter(upload));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Personal Trainer Agent running on http://localhost:${PORT}`);
});
