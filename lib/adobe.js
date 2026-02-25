/**
 * Adobe Target API — 공유 설정/유틸리티
 */
const fetch = require('node-fetch');

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

const config = {
    clientId: process.env.ADOBE_CLIENT_ID,
    clientSecret: process.env.ADOBE_CLIENT_SECRET,
    tenant: process.env.ADOBE_TENANT,
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

module.exports = {
    config,
    WORKSPACES,
    DEFAULT_WORKSPACE_ID,
    IMS_TOKEN_URL,
    getToken,
    getOfferById,
    fetchPropertiesForWorkspace
};
