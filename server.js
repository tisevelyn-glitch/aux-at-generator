require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const { requireAuth, getLoginPage, postLogin, postLogout } = require('./routes/login');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'aux-at-generator-secret-change-in-prod';

// Render 등 프록시 뒤에서 세션/쿠키 정상 동작 (trust proxy)
app.set('trust proxy', 1);

// API는 브라우저 캐시/ETag로 인해 304 응답이 섞일 수 있어 응답 누락을 방지
app.set('etag', false);
app.use('/api', function (req, res, next) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    next();
});

// 미들웨어
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));
app.options('/api/*', function (req, res) { res.sendStatus(204); });

// 로그인 (인증 불필요)
app.get('/login', getLoginPage);
app.post('/api/login', postLogin);
app.post('/api/logout', postLogout);

// 인증 필요 — 그 아래 모든 라우트
app.use(requireAuth);

// 정적 파일 + API (express.static이 / 요청 시 index.html 서빙)
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: function (res, filePath) {
        // Prevent stale JS/CSS causing old behavior after updates
        if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Pragma', 'no-cache');
        }
    }
}));
app.use('/api', require('./routes/auth'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/creation-events', require('./routes/creation-events'));
app.use('/api/activity-qa-links', require('./routes/activity-qa-links'));

// 서버 시작
const { config } = require('./lib/adobe');
var missing = [];
if (!config.clientId) missing.push('ADOBE_CLIENT_ID');
if (!config.clientSecret) missing.push('ADOBE_CLIENT_SECRET');
if (!config.tenant) missing.push('ADOBE_TENANT');
if (!process.env.AUTH_USER) missing.push('AUTH_USER');
if (!process.env.AUTH_PASSWORD) missing.push('AUTH_PASSWORD');
if (missing.length > 0) {
    console.warn('Warning: Missing env vars:', missing.join(', '));
} else {
    console.log('All required env vars are set.');
}

app.listen(PORT, function () {
    console.log('Server running at http://localhost:' + PORT);
});
