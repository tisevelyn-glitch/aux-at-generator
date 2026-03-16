/**
 * Adobe Target API — 공유 설정/유틸리티
 */
const fetch = require('node-fetch');

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

const config = {
    clientId: process.env.ADOBE_CLIENT_ID,
    clientSecret: process.env.ADOBE_CLIENT_SECRET,
    tenant: process.env.ADOBE_TENANT,
    creatorEmail: (process.env.CREATOR_EMAIL || '').trim().toLowerCase(),
    creatorImsUserId: (process.env.CREATOR_IMS_USER_ID || '').trim(),
    accessToken: process.env.ADOBE_ACCESS_TOKEN && process.env.ADOBE_ACCESS_TOKEN.trim()
        ? process.env.ADOBE_ACCESS_TOKEN.trim()
        : null
};

const WORKSPACES = [
    { name: 'Default', id: '222991964' },
    { name: '/SEBN', id: '223101869' },
    { name: '/SEF', id: '259214924' },
    { name: '/SEG', id: '223101884' },
    { name: '/SEIB-ES', id: '808870526' },
    { name: '/SEIB-PT', id: '812325246' },
    { name: '/SEUK', id: '223093514' }
];

const DEFAULT_WORKSPACE_ID = WORKSPACES[0].id;

// ── Token ────────────────────────────────────────────────────
async function getToken() {
    if (config.accessToken) return config.accessToken;
    if (!config.clientId || !config.clientSecret || !config.tenant) {
        throw new Error('Set ADOBE_ACCESS_TOKEN or ADOBE_CLIENT_ID + ADOBE_CLIENT_SECRET + ADOBE_TENANT in .env.');
    }
    var params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('scope', 'openid,AdobeID,target_sdk,read_organizations,additional_info.projectedProductContext');
    var res = await fetch(IMS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || 'Token failed');
    return data.access_token;
}

// ── Offer 단건 조회 (workspace-scoped) ───────────────────────
function getOfferById(tenant, accessToken, offerId, workspaceIdStr) {
    var url = 'https://mc.adobe.io/' + tenant + '/target/offers/content/'
        + encodeURIComponent(offerId) + '?workspace=' + encodeURIComponent(workspaceIdStr);
    return fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'X-Api-Key': config.clientId,
            'X-Admin-Workspace-Id': workspaceIdStr,
            'Accept': 'application/vnd.adobe.target.v2+json'
        }
    }).then(function (r) {
        return r.text().then(function (text) {
            var data;
            try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
            return { ok: r.ok, status: r.status, data: data };
        });
    });
}

// ── Properties (workspace 자동 매칭) ─────────────────────────
var _propertiesCache = null;
var _propertiesCacheTime = 0;
var PROPERTIES_CACHE_TTL = 5 * 60 * 1000;

async function fetchPropertiesForWorkspace(accessToken, tenant, workspaceIdStr) {
    var now = Date.now();
    if (_propertiesCache && (now - _propertiesCacheTime < PROPERTIES_CACHE_TTL)) {
        return filterByWorkspace(_propertiesCache, workspaceIdStr);
    }
    var url = 'https://mc.adobe.io/' + tenant + '/target/properties';
    console.log('[Properties] Fetching:', url);
    var res = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'X-Api-Key': config.clientId,
            'Accept': 'application/vnd.adobe.target.v1+json'
        }
    });
    var text = await res.text();
    console.log('[Properties] status=%s body=%s', res.status, text.slice(0, 500));
    var data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!res.ok || !data) {
        console.warn('[Properties] Failed:', res.status);
        return [];
    }
    var properties = Array.isArray(data) ? data : (data.properties || data.items || data.content || []);
    console.log('[Properties] count=%s', properties.length);
    _propertiesCache = properties;
    _propertiesCacheTime = now;
    return filterByWorkspace(properties, workspaceIdStr);
}

function filterByWorkspace(properties, workspaceIdStr) {
    var matched = [];
    for (var i = 0; i < properties.length; i++) {
        var ws = properties[i].workspaces || [];
        for (var j = 0; j < ws.length; j++) {
            if (String(ws[j]) === String(workspaceIdStr)) {
                matched.push(properties[i].id);
                break;
            }
        }
    }
    return matched;
}

/**
 * Activity Changelog 조회 (작성자 필터용). Adobe 문서: getChangelog
 * 응답에 author / createdBy / lastModifiedBy 등이 있으면 해당 이메일과 매칭 가능.
 */
async function getActivityChangelog(tenant, accessToken, activityId) {
    // 실제 동작 확인: /target/activities/{id}/changelog (ab 경로 아님)
    var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + encodeURIComponent(activityId) + '/changelog';
    try {
        var r = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'Accept': 'application/vnd.adobe.target.v1+json'
            }
        });
        var text = await r.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        if (!r.ok) return { ok: false, entries: [] };
        // 예시 응답: { activityChangelogs: [...] }
        var entries = Array.isArray(data) ? data : (data.activityChangelogs || data.entries || data.changelog || data.items || []);
        return { ok: true, entries: entries, raw: data };
    } catch (e) {
        return { ok: false, entries: [] };
    }
}

/**
 * Changelog 엔트리에서 작성자 이메일 추출 (author, createdBy, lastModifiedBy, user 등)
 */
function getAuthorFromChangelogEntry(entry) {
    if (!entry) return null;
    // 실제 응답에 자주 등장: modifiedByImsUserId
    if (typeof entry.modifiedByImsUserId === 'string' && entry.modifiedByImsUserId.trim()) {
        return entry.modifiedByImsUserId.trim();
    }
    var email = entry.author || entry.createdBy || entry.lastModifiedBy || entry.user || entry.userEmail || entry.email;
    if (typeof email === 'string') {
        var s = email.trim().toLowerCase();
        // 이메일 형태가 아니면 작성자 판별에 사용하지 않음 (오탐 방지)
        if (s.indexOf('@') === -1) return null;
        return s;
    }
    if (entry.user && typeof entry.user.email === 'string') {
        var u = entry.user.email.trim().toLowerCase();
        if (u.indexOf('@') === -1) return null;
        return u;
    }
    return null;
}

/**
 * Changelog에 해당 이메일이 작성자/수정자로 포함되어 있는지
 */
function changelogHasAuthor(changelogResult, creatorEmail) {
    if (!creatorEmail || !changelogResult.entries || changelogResult.entries.length === 0) return false;
    var want = String(creatorEmail).trim().toLowerCase();
    for (var i = 0; i < changelogResult.entries.length; i++) {
        var author = getAuthorFromChangelogEntry(changelogResult.entries[i]);
        if (!author) continue;
        // author가 imsUserId인 경우는 그대로 비교, email인 경우는 소문자 비교
        if (String(author).trim().toLowerCase() === want) return true;
    }
    return false;
}

module.exports = {
    config,
    WORKSPACES,
    DEFAULT_WORKSPACE_ID,
    IMS_TOKEN_URL,
    getToken,
    getOfferById,
    fetchPropertiesForWorkspace,
    getActivityChangelog,
    getAuthorFromChangelogEntry,
    changelogHasAuthor
};
