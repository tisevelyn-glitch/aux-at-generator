/**
 * 공통 유틸리티 — DOM 헬퍼, 상태 표시
 */
var API_BASE = '/api';
var accessToken = null;
var tenant = null;
var workspacesList = [];

var resultBox = document.getElementById('result');

function showStatus(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = 'status-message ' + type;
}

function showResult(message, type) {
    if (!resultBox) return;
    resultBox.textContent += message;
    resultBox.className = 'result-box ' + type;
    resultBox.scrollTop = resultBox.scrollHeight;
}

/**
 * Result box에 클릭 가능한 링크 1줄 추가
 */
function showResultLink(label, url, type) {
    if (!resultBox) return;
    var line = document.createElement('div');
    line.className = 'result-line';
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    line.appendChild(a);
    resultBox.appendChild(line);
    resultBox.className = 'result-box ' + (type || '');
    resultBox.scrollTop = resultBox.scrollHeight;
}

/**
 * Adobe Target UI Activity Details URL 생성 (A/B manual)
 * 룰 예시:
 * https://experience.adobe.com/#/@samsungeu/target/activities/activity-details/ab_manual/{activityId}/overview
 */
function buildTargetAbActivityUrl(activityId) {
    var id = String(activityId || '').trim();
    if (!id) return '';
    // 필요 시 window.TARGET_ORG_SLUG로 오버라이드 가능
    var orgSlug = (window.TARGET_ORG_SLUG && String(window.TARGET_ORG_SLUG).trim()) || 'samsungeu';
    return 'https://experience.adobe.com/#/@' + encodeURIComponent(orgSlug)
        + '/target/activities/activity-details/ab_manual/' + encodeURIComponent(id) + '/overview';
}

function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function getWorkspaceNameById(id) {
    var ws = workspacesList.filter(function (w) { return String(w.id) === String(id); })[0];
    return ws ? ws.name : id;
}

/**
 * API fetch + JSON 파싱. 401이거나 HTML(<!)이 오면 로그인 페이지로 이동 (Unexpected token '<' 방지)
 */
function fetchJson(url, options) {
    options = options || {};
    if (options.credentials === undefined) options.credentials = 'same-origin';
    return fetch(url, options).then(function (res) {
        return res.text().then(function (text) {
            if (res.status === 401 || (text && text.trim().indexOf('<!') === 0)) {
                try {
                    var activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && activeTab.getAttribute('data-tab') === 'my-content') {
                        sessionStorage.setItem('returnTab', 'my-content');
                    }
                } catch (e) {}
                window.location.href = '/login';
                throw new Error('Session expired');
            }
            try {
                return { data: JSON.parse(text), ok: res.ok, status: res.status };
            } catch (e) {
                throw new Error(text ? text.slice(0, 100) : 'Invalid response');
            }
        });
    });
}
