/**
 * 앱 초기화 — 토큰 발급 + 워크스페이스 로드
 */
(function () {
    var wsSelect = document.getElementById('workspaceSelect');
    var execBtn = document.getElementById('executeBtn');

    async function loadWorkspaces() {
        try {
            var r = await fetchJson(API_BASE + '/workspaces');
            var data = r.data;
            if (!r.ok) throw new Error(data.error || 'Failed to load workspaces');
            workspacesList = data.workspaces || [];
            var opts = '<option value="">— Select workspace —</option>';
            workspacesList.forEach(function (ws) {
                opts += '<option value="' + escapeHtml(ws.id) + '">' + escapeHtml(ws.name) + '</option>';
            });
            if (wsSelect) wsSelect.innerHTML = opts;
        } catch (e) {
            if (wsSelect) wsSelect.innerHTML = '<option value="">— Select workspace —</option><option value="" disabled>Failed to load</option>';
            console.error('loadWorkspaces:', e);
        }
    }
    function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    async function init() {
        loadWorkspaces();
        try {
            var cfgR = await fetchJson(API_BASE + '/config');
            var cfg = cfgR.data;
            if (!cfg.hasConfig) {
                showResult('Missing .env configuration. Set ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_TENANT.\n', 'error');
                return;
            }
            tenant = cfg.tenant;

            var tokR = await fetchJson(API_BASE + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            var tokData = tokR.data;
            if (!tokR.ok) {
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
