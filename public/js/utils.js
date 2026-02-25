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

function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function getWorkspaceNameById(id) {
    var ws = workspacesList.filter(function (w) { return String(w.id) === String(id); })[0];
    return ws ? ws.name : id;
}
