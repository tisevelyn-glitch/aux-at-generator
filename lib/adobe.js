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
// HTML/컨텐츠 오퍼 — /target/offers/content/{id}
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
            return { ok: r.ok, status: r.status, data: data, _endpoint: 'content' };
        });
    });
}

// JSON 오퍼 — content 엔드포인트로는 404/타입 누락이 나올 수 있어 별도 경로
function getJsonOfferById(tenant, accessToken, offerId, workspaceIdStr) {
    var url = 'https://mc.adobe.io/' + tenant + '/target/offers/json/'
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
            return { ok: r.ok, status: r.status, data: data, _endpoint: 'json' };
        });
    });
}

/** content → 실패 시 json 엔드포인트 순서로 단건 조회 */
function getOfferByIdContentOrJson(tenant, accessToken, offerId, workspaceIdStr) {
    return getOfferById(tenant, accessToken, offerId, workspaceIdStr).then(function (r) {
        if (r.ok) return r;
        if (r.status === 404 || r.status === 400 || r.status === 403) {
            return getJsonOfferById(tenant, accessToken, offerId, workspaceIdStr).then(function (r2) {
                if (r2.ok) return r2;
                return r;
            });
        }
        return r;
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
 * 멀티 워크스페이스에서는 해당 액티비티의 workspaceId를 넘기지 않으면 빈 응답이 나올 수 있음.
 */
async function getActivityChangelog(tenant, accessToken, activityId, workspaceIdOptional) {
    // 실제 동작 확인: /target/activities/{id}/changelog (ab 경로 아님)
    var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + encodeURIComponent(activityId) + '/changelog';
    var headers = {
        'Authorization': 'Bearer ' + accessToken,
        'X-Api-Key': config.clientId,
        'Accept': 'application/vnd.adobe.target.v1+json'
    };
    if (workspaceIdOptional != null && String(workspaceIdOptional).trim() !== '') {
        headers['X-Admin-Workspace-Id'] = String(workspaceIdOptional).trim();
    }
    try {
        var r = await fetch(url, {
            method: 'GET',
            headers: headers
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
    var list = authorCandidatesFromChangelogEntry(entry);
    return list.length ? list[0] : null;
}

/**
 * 한 changelog 엔트리에서 나올 수 있는 작성자/수정자 식별자 전부 (우선순위만 getAuthor와 다름)
 */
function authorCandidatesFromChangelogEntry(entry) {
    var out = [];
    if (!entry) return out;
    function push(val) {
        if (val == null) return;
        var t = String(val).trim();
        if (t) out.push(t);
    }
    push(entry.modifiedByImsUserId);
    push(entry.author);
    push(entry.createdBy);
    push(entry.lastModifiedBy);
    push(entry.userEmail);
    push(entry.email);
    if (entry.user && typeof entry.user === 'object') {
        push(entry.user.email);
    }
    return out;
}

/**
 * 쿼리 workspaceIds(쉼표·반복)로 조회할 워크스페이스 부분집합 결정.
 * - 키 없음: mode omit (호출부에서 단일 workspaceId 등 처리)
 * - 키 있고 값 비어 있음·유효 토큰 없음: mode invalid (빈 값으로 전체 조회되는 실수 방지)
 * - 유효 id 1개 이상: mode subset + workspaceIdSet
 * - 토큰은 있는데 매칭 없음: mode invalid
 */
function resolveWorkspacesFromQuery(query, workspaces) {
    if (!Object.prototype.hasOwnProperty.call(query, 'workspaceIds')) {
        return { mode: 'omit' };
    }
    var raw = query.workspaceIds;
    if (raw == null || raw === '') {
        return { mode: 'invalid', tokens: [] };
    }
    var tokens = [];
    if (Array.isArray(raw)) {
        raw.forEach(function (part) {
            String(part).split(/[\s,]+/).forEach(function (t) {
                var s = t.trim();
                if (s) tokens.push(s);
            });
        });
    } else {
        String(raw).split(/[\s,]+/).forEach(function (t) {
            var s = t.trim();
            if (s) tokens.push(s);
        });
    }
    if (tokens.length === 0) {
        return { mode: 'invalid', tokens: [] };
    }
    var byId = {};
    workspaces.forEach(function (w) {
        byId[String(w.id)] = w;
    });
    var out = [];
    var seen = new Set();
    tokens.forEach(function (tid) {
        if (seen.has(tid)) return;
        var w = byId[tid];
        if (w) {
            seen.add(tid);
            out.push(w);
        }
    });
    if (out.length === 0) {
        return { mode: 'invalid', tokens: tokens };
    }
    var idSet = new Set();
    out.forEach(function (w) {
        idSet.add(String(w.id));
    });
    return { mode: 'subset', workspaces: out, workspaceIdSet: idSet };
}

/**
 * Changelog에 해당 이메일이 작성자/수정자로 포함되어 있는지
 */
function changelogHasAuthor(changelogResult, creatorEmail) {
    if (!creatorEmail || !changelogResult.entries || changelogResult.entries.length === 0) return false;
    var want = String(creatorEmail).trim().toLowerCase();
    for (var i = 0; i < changelogResult.entries.length; i++) {
        var candidates = authorCandidatesFromChangelogEntry(changelogResult.entries[i]);
        for (var j = 0; j < candidates.length; j++) {
            var c = String(candidates[j]).trim().toLowerCase();
            if (c === want) return true;
        }
    }
    return false;
}

module.exports = {
    config,
    WORKSPACES,
    DEFAULT_WORKSPACE_ID,
    IMS_TOKEN_URL,
    resolveWorkspacesFromQuery,
    getToken,
    getOfferById,
    getJsonOfferById,
    getOfferByIdContentOrJson,
    fetchPropertiesForWorkspace,
    getActivityChangelog,
    getAuthorFromChangelogEntry,
    authorCandidatesFromChangelogEntry,
    changelogHasAuthor
};
