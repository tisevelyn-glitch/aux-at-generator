/**
 * 로그인 페이지 + 인증 처리
 */
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
}

function getLoginHtml() {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login — Adobe Target Activity Generator</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .login-card {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            width: 100%;
            max-width: 380px;
        }
        h1 { font-size: 1.5rem; color: #1e293b; margin-bottom: 8px; }
        .sub { font-size: 0.9rem; color: #64748b; margin-bottom: 24px; }
        label { display: block; font-size: 0.875rem; font-weight: 600; color: #334155; margin-bottom: 6px; }
        input {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            margin-bottom: 16px;
        }
        input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
        button {
            width: 100%;
            padding: 12px;
            background: #3b82f6;
            color: #fff;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        button:hover { background: #2563eb; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .error { background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px; font-size: 0.875rem; margin-bottom: 16px; display: none; }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>Adobe Target Activity Generator</h1>
        <p class="sub">Sign in to continue</p>
        <div id="error" class="error"></div>
        <form id="loginForm" method="post" action="/api/login">
            <label for="id">ID</label>
            <input type="text" id="id" name="id" placeholder="Enter your ID" required autocomplete="username">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Enter your password" required autocomplete="current-password">
            <button type="submit" id="submitBtn">Sign in</button>
        </form>
    </div>
    <script>
        var form = document.getElementById('loginForm');
        var errorEl = document.getElementById('error');
        var submitBtn = document.getElementById('submitBtn');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorEl.style.display = 'none';
            errorEl.textContent = '';
            submitBtn.disabled = true;
            fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: document.getElementById('id').value, password: document.getElementById('password').value }),
                credentials: 'same-origin'
            }).then(function (r) { return r.json().then(function (data) {
                if (r.ok && data.ok) {
                    window.location.href = data.redirect || '/';
                    return;
                }
                errorEl.textContent = data.error || 'Login failed';
                errorEl.style.display = 'block';
                submitBtn.disabled = false;
            }); }).catch(function () {
                errorEl.textContent = 'Network error';
                errorEl.style.display = 'block';
                submitBtn.disabled = false;
            });
        });
    </script>
</body>
</html>`;
}

function getLoginPage(req, res) {
    if (req.session && req.session.authenticated) return res.redirect('/');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(getLoginHtml());
}

function postLogin(req, res) {
    var id = (req.body.id || req.body.username || '').trim();
    var pw = (req.body.password || req.body.pw || '').trim();

    if (!AUTH_USER || !AUTH_PASSWORD) {
        return res.status(500).json({ error: 'Server: AUTH_USER and AUTH_PASSWORD must be set in .env' });
    }

    if (id === AUTH_USER && pw === AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.user = id;
        return res.json({ ok: true, redirect: '/' });
    }

    res.status(401).json({ error: 'Invalid ID or password' });
}

function postLogout(req, res) {
    req.session.destroy(function () {
        res.json({ ok: true, redirect: '/login' });
    });
}

module.exports = { requireAuth, getLoginPage, postLogin, postLogout };
