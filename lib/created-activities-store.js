/**
 * 현재 등록된 API(.env)로 이 앱에서 생성한 Activity ID만 저장/조회
 * → 목록 API에서 "내가 만든" 액티비티만 노출할 때 사용
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'created-activities.json');

function ensureDir() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
}

function readEntries() {
    ensureDir();
    try {
        var raw = fs.readFileSync(FILE, 'utf8');
        var data = JSON.parse(raw);
        return Array.isArray(data.entries) ? data.entries : [];
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        return [];
    }
}

function writeEntries(entries) {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify({ entries: entries }, null, 2), 'utf8');
}

/**
 * 이 앱에서 Activity 생성 시 호출. 현재 API(tenant + clientId)로 생성된 ID 등록.
 */
function addCreated(tenant, clientId, activityId) {
    if (!tenant || !clientId || activityId == null) return;
    var entries = readEntries();
    var idStr = String(activityId);
    if (entries.some(function (e) { return e.tenant === tenant && e.clientId === clientId && String(e.id) === idStr; })) return;
    entries.push({ id: activityId, tenant: tenant, clientId: clientId });
    writeEntries(entries);
}

/**
 * 현재 API(tenant + clientId)로 이 앱에서 생성한 Activity ID 집합 반환.
 */
function getCreatedIdsForApi(tenant, clientId) {
    var entries = readEntries();
    var set = new Set();
    entries.forEach(function (e) {
        if (e.tenant === tenant && e.clientId === clientId) set.add(String(e.id));
    });
    return set;
}

/**
 * "내 목록"에서 제외 — 해당 Activity는 더 이상 리스트에 노출되지 않음.
 */
function removeFromCreated(tenant, clientId, activityId) {
    if (!tenant || !clientId || activityId == null) return;
    var entries = readEntries();
    var idStr = String(activityId);
    var filtered = entries.filter(function (e) {
        return !(e.tenant === tenant && e.clientId === clientId && String(e.id) === idStr);
    });
    if (filtered.length !== entries.length) writeEntries(filtered);
}

module.exports = {
    addCreated,
    getCreatedIdsForApi,
    removeFromCreated
};
