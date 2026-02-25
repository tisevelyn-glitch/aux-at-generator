/**
 * 앱 초기화 — 토큰 발급 + 워크스페이스 로드
 */
(function () {
    var wsSelect = document.getElementById('workspaceSelect');
    var execBtn = document.getElementById('executeBtn');

    async function loadWorkspaces() {
        if (!wsSelect) return;
        try {
            var res = await fetch(API_BASE + '/workspaces');
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load workspaces');
            workspacesList = data.workspaces || [];
            wsSelect.innerHTML = '<option value="">— Select workspace —</option>';
            workspacesList.forEach(function (ws) {
                var opt = document.createElement('option');
                opt.value = ws.id;
                opt.textContent = ws.name;
                wsSelect.appendChild(opt);
            });
        } catch (e) {
            wsSelect.innerHTML = '<option value="">— Select workspace —</option><option value="" disabled>Failed to load</option>';
            console.error('loadWorkspaces:', e);
        }
    }

    async function init() {
        loadWorkspaces();
        try {
            var cfgRes = await fetch(API_BASE + '/config');
            var cfg = await cfgRes.json();
            if (!cfg.hasConfig) {
                showResult('Missing .env configuration. Set ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_TENANT.\n', 'error');
                return;
            }
            tenant = cfg.tenant;

            var tokRes = await fetch(API_BASE + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            var tokData = await tokRes.json();
            if (!tokRes.ok) {
                showResult('Token failed: ' + (tokData.error || 'Unknown error') + '\n', 'error');
                return;
            }
            accessToken = tokData.accessToken;
            if (execBtn) execBtn.disabled = false;
        } catch (e) {
            console.error('Init error:', e);
            showResult('Failed to connect. Check server and .env.\n', 'error');
        }
    }

    if (resultBox) resultBox.textContent = '';
    window.addEventListener('DOMContentLoaded', init);
})();
