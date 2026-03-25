/**
 * 현재 등록된 API(.env)로 이 앱에서 생성한 Offer ID만 저장/조회
 * → 목록 API에서 "이 앱이 만든 Offer만" 노출할 때 사용
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'created-offers.json');

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

function listCreatedOffersForApi(tenant, clientId) {
    var entries = readEntries();
    return entries
        .filter(function (e) { return e.tenant === tenant && e.clientId === clientId; })
        .map(function (e) {
            return {
                id: String(e.id),
                workspaceId: e.workspaceId != null ? String(e.workspaceId) : null
            };
        });
}

function addCreatedOffer(tenant, clientId, offerId, workspaceId) {
    if (!tenant || !clientId || offerId == null) return;
    var entries = readEntries();
    var idStr = String(offerId);
    if (entries.some(function (e) { return e.tenant === tenant && e.clientId === clientId && String(e.id) === idStr; })) return;
    var ws = workspaceId != null && String(workspaceId).trim() ? String(workspaceId).trim() : null;
    entries.push({ id: offerId, tenant: tenant, clientId: clientId, workspaceId: ws });
    writeEntries(entries);
}

function getCreatedOfferIdsForApi(tenant, clientId) {
    var entries = readEntries();
    var set = new Set();
    entries.forEach(function (e) {
        if (e.tenant === tenant && e.clientId === clientId) set.add(String(e.id));
    });
    return set;
}

function getCreatedOfferMetaById(tenant, clientId, offerId) {
    if (!tenant || !clientId || offerId == null) return null;
    var entries = readEntries();
    var idStr = String(offerId);
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (e.tenant === tenant && e.clientId === clientId && String(e.id) === idStr) {
            return { id: String(e.id), workspaceId: e.workspaceId != null ? String(e.workspaceId) : null };
        }
    }
    return null;
}

function removeFromCreatedOffers(tenant, clientId, offerId) {
    if (!tenant || !clientId || offerId == null) return;
    var entries = readEntries();
    var idStr = String(offerId);
    var filtered = entries.filter(function (e) {
        return !(e.tenant === tenant && e.clientId === clientId && String(e.id) === idStr);
    });
    if (filtered.length !== entries.length) writeEntries(filtered);
}

module.exports = {
    addCreatedOffer,
    listCreatedOffersForApi,
    getCreatedOfferIdsForApi,
    getCreatedOfferMetaById,
    removeFromCreatedOffers
};

