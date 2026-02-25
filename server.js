require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());
app.options('/api/*', function (req, res) { res.sendStatus(204); });
app.use(express.static(path.join(__dirname, 'public')));

// 라우트
app.use('/api', require('./routes/auth'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/activities', require('./routes/activities'));

// 서버 시작
const { config } = require('./lib/adobe');
var missing = [];
if (!config.clientId) missing.push('ADOBE_CLIENT_ID');
if (!config.clientSecret) missing.push('ADOBE_CLIENT_SECRET');
if (!config.tenant) missing.push('ADOBE_TENANT');
if (missing.length > 0) {
    console.warn('Warning: Missing env vars:', missing.join(', '));
} else {
    console.log('All environment variables are set.');
}

app.listen(PORT, function () {
    console.log('Server running at http://localhost:' + PORT);
});
