/**
 * 앱 초기화 — 토큰 발급 + 워크스페이스 로드
 */
(function () {
    var wsCheckboxesEl = document.getElementById('workspaceCheckboxes');
    var wsSelectAllEl = document.getElementById('workspaceSelectAll');
    var createOffersBtn = document.getElementById('createOffersBtn'); // legacy (removed from UI)
    var createActivitiesBtn = document.getElementById('createActivitiesBtn');
    var offerCreateBtn = document.getElementById('offerCreateBtn');

    async function loadWorkspaces() {
        try {
            var r = await fetchJson(API_BASE + '/workspaces');
            var data = r.data;
            if (!r.ok) throw new Error(data.error || 'Failed to load workspaces');
            workspacesList = data.workspaces || [];
            if (data.defaultWorkspaceId != null) {
                window.DEFAULT_WORKSPACE_ID = String(data.defaultWorkspaceId);
            } else if (workspacesList[0] && workspacesList[0].id != null) {
                window.DEFAULT_WORKSPACE_ID = String(workspacesList[0].id);
            }
            if (wsCheckboxesEl) {
                var html = '';
                workspacesList.forEach(function (ws) {
                    html += '<label class="workspace-checkbox">' +
                        '<input type="checkbox" class="workspace-cb" value="' + escapeHtml(ws.id) + '">' +
                        '<span class="workspace-name">' + escapeHtml(ws.name) + '</span>' +
                        '</label>';
                });
                wsCheckboxesEl.innerHTML = html;
            }
        } catch (e) {
            if (wsCheckboxesEl) wsCheckboxesEl.innerHTML = '<div class="workspace-checkbox-error">Failed to load workspaces</div>';
            console.error('loadWorkspaces:', e);
        }
    }
    function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    async function init() {
        loadWorkspaces();
        if (wsSelectAllEl) {
            wsSelectAllEl.addEventListener('change', function (e) {
                var checked = !!e.target.checked;
                var cbs = document.querySelectorAll('.workspace-cb');
                cbs.forEach(function (cb) { cb.checked = checked; });
            });
        }
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
            if (createOffersBtn) createOffersBtn.disabled = false;
            if (createActivitiesBtn) createActivitiesBtn.disabled = true;
            if (offerCreateBtn) offerCreateBtn.disabled = false;
        } catch (e) {
            console.error('Init error:', e);
            showResult('Failed to connect. Check server and .env.\n', 'error');
        }
    }

    if (resultBox) resultBox.textContent = '';
    window.addEventListener('DOMContentLoaded', init);
})();
