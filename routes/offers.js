/**
 * Offer 라우트 — 조회 / 생성
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, getToken, getOfferById, getOfferByIdContentOrJson, getActivityChangelog, changelogHasAuthor } = require('../lib/adobe');
const { addCreatedOffer, listCreatedOffersForApi, getCreatedOfferIdsForApi, getCreatedOfferMetaById, removeFromCreatedOffers } = require('../lib/created-offers-store');

var CONCURRENCY = 5;
var MAX_ACTIVITIES_FOR_CHANGELOG = 250;

/** Adobe offer 본문의 workspace → 워크스페이스 ID 문자열 (없으면 null) */
function workspaceIdFromOfferPayload(offerPayload, depth) {
    depth = depth || 0;
    if (!offerPayload || depth > 4) return null;
    if (offerPayload._meta && offerPayload._meta.workspaceId != null) {
        return String(offerPayload._meta.workspaceId).trim();
    }
    if (offerPayload.workspaceId != null && typeof offerPayload.workspaceId !== 'object') {
        return String(offerPayload.workspaceId).trim();
    }
    if (offerPayload.workspace == null) {
        if (offerPayload.data && typeof offerPayload.data === 'object') {
            var nested = workspaceIdFromOfferPayload(offerPayload.data, depth + 1);
            if (nested) return nested;
        }
        return null;
    }
    var w = offerPayload.workspace;
    if (typeof w === 'string' || typeof w === 'number') {
        var s = String(w).trim();
        return s || null;
    }
    if (typeof w === 'object' && !Array.isArray(w)) {
        if (w.id != null) return String(w.id).trim();
        if (w.workspaceId != null) return String(w.workspaceId).trim();
        if (w.name != null && WORKSPACES && WORKSPACES.length) {
            var nm = String(w.name).trim();
            for (var i = 0; i < WORKSPACES.length; i++) {
                if (String(WORKSPACES[i].name) === nm) return String(WORKSPACES[i].id).trim();
            }
        }
    }
    return null;
}

/**
 * 본문에 workspace가 없거나 요청 WS와 불일치할 때, 등록된 모든 WS로 단건 조회해 실제 소속 WS ID를 찾음
 */
async function resolveFoundWorkspaceIdForOffer(tenant, accessToken, offerId, primaryWsId, primaryOk, primaryData) {
    if (primaryOk && primaryData) {
        var w0 = workspaceIdFromOfferPayload(primaryData);
        if (w0) return w0;
    }
    for (var j = 0; j < WORKSPACES.length; j++) {
        var wsId = WORKSPACES[j].id;
        if (primaryOk && String(wsId) === String(primaryWsId)) continue;
        var r = await getOfferByIdContentOrJson(tenant, accessToken, offerId, wsId);
        if (r.ok && r.data) {
            var fa = workspaceIdFromOfferPayload(r.data);
            if (fa) return fa;
        }
    }
    return String(primaryWsId);
}

/** Adobe 단건 응답 → UI에 쓸 메타 필드 (Target UI와 유사) */
function normalizeActorField(actor) {
    if (actor == null || actor === '') return '';
    if (typeof actor === 'string' || typeof actor === 'number') return String(actor).trim();
    if (typeof actor === 'object') {
        return String(
            actor.name || actor.displayName || actor.fullName || actor.email || actor.imsUserId || actor.userId || ''
        ).trim();
    }
    return '';
}

function coerceIsoLike(val) {
    if (val == null) return undefined;
    if (typeof val === 'string' || typeof val === 'number') return val;
    if (typeof val === 'object' && val !== null) {
        return val.date || val.dateTime || val.value || val.time || undefined;
    }
    return undefined;
}

/** Adobe v2 본문: data 중첩·엔드포인트별 필드명 차이 흡수 */
function flattenOfferApiPayload(raw) {
    if (!raw || typeof raw !== 'object') return {};
    var o = Object.assign({}, raw);
    if (raw.data && typeof raw.data === 'object') {
        o = Object.assign({}, raw.data, raw);
    }
    return o;
}

function pickOfferDetailsForClient(raw, fetchMeta) {
    fetchMeta = fetchMeta || {};
    var f = flattenOfferApiPayload(raw);
    var modifiedAt = f.modifiedAt || f.modified || f.updatedAt || f.lastModified || f.lastModifiedAt || f.lastModifiedDate;
    modifiedAt = coerceIsoLike(modifiedAt) || modifiedAt;
    if (typeof modifiedAt === 'object') modifiedAt = undefined;
    var modifiedBy = normalizeActorField(f.modifiedBy || f.lastModifiedBy || f.lastModifiedByUser);
    if (!modifiedBy) modifiedBy = normalizeActorField(f.modifiedByImsUserId);
    var createdAt = f.createdAt || f.created;
    createdAt = coerceIsoLike(createdAt) || createdAt;
    if (typeof createdAt === 'object') createdAt = undefined;
    var createdBy = normalizeActorField(f.createdBy || f.author);
    var typeVal = f.type;
    if (typeVal == null || typeVal === '') typeVal = f.contentType;
    if (typeVal == null || typeVal === '') typeVal = f.offerType;
    if ((typeVal == null || typeVal === '') && f.jsonContent != null) typeVal = 'json';
    if ((typeVal == null || typeVal === '') && (f.content != null || f.html != null)) typeVal = 'html';
    if ((typeVal == null || typeVal === '') && fetchMeta.endpoint === 'json') typeVal = 'json';
    if ((typeVal == null || typeVal === '') && fetchMeta.endpoint === 'content') typeVal = 'html';
    return {
        id: f.id,
        name: f.name,
        content: f.content,
        workspace: f.workspace,
        type: typeVal,
        contentType: f.contentType != null ? f.contentType : typeVal,
        offerType: f.offerType != null ? f.offerType : typeVal,
        modifiedAt: modifiedAt,
        modifiedBy: modifiedBy || undefined,
        createdAt: createdAt,
        createdBy: createdBy || undefined,
        description: f.description,
        status: f.status,
        state: f.state
    };
}

async function fetchActivitiesByWorkspaceTyped(tenant, accessToken, workspaceId) {
    var headers = {
        'Authorization': 'Bearer ' + accessToken,
        'X-Api-Key': config.clientId,
        'X-Admin-Workspace-Id': workspaceId,
        'Accept': 'application/vnd.adobe.target.v1+json'
    };
    var all = [];
    for (var t = 0; t < 2; t++) {
        var typePath = t === 0 ? 'ab' : 'xt';
        var activityType = t === 0 ? 'ab' : 'xt';
        var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '?workspace=' + encodeURIComponent(workspaceId);
        try {
            var r = await fetch(url, { method: 'GET', headers: headers });
            var body;
            try { body = JSON.parse(await r.text()); } catch (e) { body = null; }
            if (r.ok && body) {
                var list = Array.isArray(body) ? body : (body.activities || body.content || body.items || []);
                list.forEach(function (a) {
                    all.push(Object.assign({}, a, { activityType: activityType }));
                });
            }
        } catch (e) {}
    }
    return all;
}

async function filterActivitiesByCreator(activities, accessToken, tenant) {
    var creator = config.creatorImsUserId || config.creatorEmail;
    if (!creator || activities.length === 0) return activities;
    var list = activities.slice(0, MAX_ACTIVITIES_FOR_CHANGELOG);
    var result = [];
    for (var i = 0; i < list.length; i += CONCURRENCY) {
        var batch = list.slice(i, i + CONCURRENCY);
        var changelogs = await Promise.all(batch.map(function (a) {
            var id = a.id || a.activityId;
            return getActivityChangelog(tenant, accessToken, id, a.workspaceId).then(function (cl) {
                return { activity: a, changelog: cl };
            });
        }));
        for (var j = 0; j < changelogs.length; j++) {
            var item = changelogs[j];
            if (changelogHasAuthor(item.changelog, creator)) result.push(item.activity);
        }
    }
    return result;
}

async function getActivityDetail(tenant, accessToken, activityId, activityType) {
    var typePath = (String(activityType || 'ab').toLowerCase() === 'xt') ? 'xt' : 'ab';
    var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '/' + encodeURIComponent(activityId);
    var r = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'X-Api-Key': config.clientId,
            'Accept': 'application/vnd.adobe.target.v3+json'
        }
    });
    var text = await r.text();
    var data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { ok: r.ok, status: r.status, data: data };
}

// GET /api/offers/list — workspaceId 없으면 전체 워크스페이스 조회(각 항목에 workspace 정보 포함)
router.get('/list', async function (req, res) {
    try {
        var workspaceId = String(req.query.workspaceId || '').trim();
        var allMode = String(req.query.all || '').trim() === '1';
        var mode = String(req.query.mode || '').trim(); // optional: usedByCreator
        var tenant = config.tenant;
        var accessToken = await getToken();
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'Tenant and ADOBE_CLIENT_ID required.' });
        }

        // default mode: "이 앱이 만든 offer"는 store를 source of truth로 삼고 단건 조회로 리스트 구성
        // - /target/offers 는 content offer가 바로 안 잡히는 케이스가 있어 누락될 수 있음
        // - all=1 또는 mode 지정 시에는 기존 방식(/target/offers listing) 유지
        if (!allMode && !mode) {
            var entries = listCreatedOffersForApi(tenant, config.clientId);
            if (workspaceId) {
                entries = entries.filter(function (e) { return String(e.workspaceId || '') === String(workspaceId); });
            }
            if (entries.length === 0) return res.json({ offers: [] });

            var offers = [];
            for (var i0 = 0; i0 < entries.length; i0 += CONCURRENCY) {
                var batch0 = entries.slice(i0, i0 + CONCURRENCY);
                var fetched = await Promise.all(batch0.map(function (e) {
                    var wsId = e.workspaceId || '';
                    if (!wsId) return Promise.resolve({ ok: false, status: 400, data: null, _meta: e });
                    return getOfferById(tenant, accessToken, e.id, wsId).then(function (r) {
                        return Object.assign({}, r, { _meta: e });
                    });
                }));
                fetched.forEach(function (r) {
                    if (!r.ok || !r.data) return;
                    var wsId = r._meta.workspaceId || '';
                    var ws = WORKSPACES.find(function (w) { return String(w.id) === String(wsId); });
                    var wsName = ws ? ws.name : wsId;
                    offers.push(Object.assign({}, r.data, { workspaceId: wsId, workspaceName: wsName }));
                });
            }
            return res.json({ offers: offers });
        }

        // mode=usedByCreator: "내가 만든 Activity들에서 사용된 Offer" 목록 생성
        if (mode === 'usedByCreator') {
            var creator = config.creatorImsUserId || config.creatorEmail;
            if (!creator) {
                return res.status(400).json({ error: 'Set CREATOR_IMS_USER_ID (recommended) or CREATOR_EMAIL in .env to use mode=usedByCreator.' });
            }
            // 1) creator activity IDs 수집
            var activitiesAll = [];
            for (var w = 0; w < WORKSPACES.length; w++) {
                var wsId0 = WORKSPACES[w].id;
                var wsName0 = WORKSPACES[w].name;
                var typed = await fetchActivitiesByWorkspaceTyped(tenant, accessToken, wsId0);
                typed = typed.map(function (a) { return Object.assign({}, a, { workspaceId: wsId0, workspaceName: wsName0 }); });
                activitiesAll = activitiesAll.concat(typed);
            }
            var creatorActivities = await filterActivitiesByCreator(activitiesAll, accessToken, tenant);
            var creatorActivityInfos = creatorActivities.map(function (a) {
                return {
                    id: String(a.id || a.activityId),
                    activityType: a.activityType || a.type || 'ab',
                    workspaceId: a.workspaceId,
                    workspaceName: a.workspaceName
                };
            });

            // 2) 각 activity detail에서 offerId 수집
            var offerToSources = {}; // offerId -> { offerId, sources: [{activityId, workspaceId, activityType}] }
            for (var i = 0; i < creatorActivityInfos.length; i += CONCURRENCY) {
                var batch = creatorActivityInfos.slice(i, i + CONCURRENCY);
                var details = await Promise.all(batch.map(function (info) {
                    return getActivityDetail(tenant, accessToken, info.id, info.activityType).then(function (d) {
                        return { info: info, detail: d };
                    });
                }));
                details.forEach(function (item) {
                    if (!item.detail.ok || !item.detail.data) return;
                    var opts = item.detail.data.options || [];
                    opts.forEach(function (o) {
                        var oid = o && (o.offerId != null ? String(o.offerId) : null);
                        if (!oid) return;
                        if (!offerToSources[oid]) offerToSources[oid] = { offerId: oid, sources: [] };
                        offerToSources[oid].sources.push({
                            activityId: item.info.id,
                            activityType: item.info.activityType,
                            workspaceId: item.info.workspaceId,
                            workspaceName: item.info.workspaceName
                        });
                    });
                });
            }
            var offerIdsWanted = Object.keys(offerToSources);

            // 3) offers 목록에서 위 offerIds만 필터 (이 단계는 name/type/modifiedAt 붙이기용)
            var offersAll = [];
            for (var w2 = 0; w2 < WORKSPACES.length; w2++) {
                var wsId = WORKSPACES[w2].id;
                var wsName = WORKSPACES[w2].name;
                var url = 'https://mc.adobe.io/' + tenant + '/target/offers?workspace=' + encodeURIComponent(wsId);
                var r = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                        'X-Api-Key': config.clientId,
                        'X-Admin-Workspace-Id': wsId,
                        'Accept': 'application/vnd.adobe.target.v1+json'
                    }
                });
                var body;
                try { body = JSON.parse(await r.text()); } catch (e) { body = null; }
                if (r.ok && body) {
                    var list = Array.isArray(body) ? body : (body.offers || body.content || []);
                    list.forEach(function (o) {
                        offersAll.push(Object.assign({}, o, { workspaceId: wsId, workspaceName: wsName }));
                    });
                }
            }
            var setWanted = new Set(offerIdsWanted);
            var filtered = offersAll.filter(function (o) { return setWanted.has(String(o.id || o.offerId)); });
            filtered = filtered.map(function (o) {
                var oid = String(o.id || o.offerId);
                return Object.assign({}, o, { usedBy: offerToSources[oid] ? offerToSources[oid].sources : [] });
            });
            return res.json({ offers: filtered, meta: { mode: mode, creatorActivities: creatorActivityInfos.length, uniqueOfferIds: offerIdsWanted.length } });
        }

        var createdIds = getCreatedOfferIdsForApi(tenant, config.clientId);

        if (workspaceId) {
            // NOTE: /target/offers/content 은 GET이 405로 막힐 수 있어 목록은 /target/offers 를 사용
            var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/offers?workspace=' + encodeURIComponent(workspaceId);
            var response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'X-Api-Key': config.clientId,
                    'X-Admin-Workspace-Id': workspaceId,
                    'Accept': 'application/vnd.adobe.target.v1+json'
                }
            });
            var data = await response.json();
            if (!response.ok) {
                return res.status(response.status).json({ error: data.message || data.error || 'Failed to list offers' });
            }
            var offers = Array.isArray(data) ? data : (data.offers || data.content || []);
            var ws = WORKSPACES.find(function (w) { return String(w.id) === String(workspaceId); });
            var workspaceName = ws ? ws.name : workspaceId;
            offers = offers.map(function (o) {
                return Object.assign({}, o, { workspaceId: workspaceId, workspaceName: workspaceName });
            });
            if (!allMode) {
                offers = offers.filter(function (o) { return createdIds.has(String(o.id || o.offerId)); });
            }
            return res.json({ offers: offers });
        }

        var all = [];
        for (var i = 0; i < WORKSPACES.length; i++) {
            var wsId = WORKSPACES[i].id;
            var wsName = WORKSPACES[i].name;
            // NOTE: 목록은 /target/offers (GET) 사용
            var url = 'https://mc.adobe.io/' + tenant + '/target/offers?workspace=' + encodeURIComponent(wsId);
            var r = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'X-Api-Key': config.clientId,
                    'X-Admin-Workspace-Id': wsId,
                    'Accept': 'application/vnd.adobe.target.v1+json'
                }
            });
            var body;
            try { body = await r.json(); } catch (e) { body = null; }
            if (r.ok && body) {
                var list = Array.isArray(body) ? body : (body.offers || body.content || []);
                list.forEach(function (o) {
                    all.push(Object.assign({}, o, { workspaceId: wsId, workspaceName: wsName }));
                });
            }
        }
        if (!allMode) {
            all = all.filter(function (o) { return createdIds.has(String(o.id || o.offerId)); });
        }
        res.json({ offers: all });
    } catch (error) {
        console.error('Offers list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/offers/:id — 단건 조회 (워크스페이스 순회 포함)
router.get('/:id', async function (req, res) {
    var offerId = String(req.params.id || '').trim();
    var workspaceId = String(req.query.workspaceId || '').trim();
    console.log('[Offer GET] offerId=%s workspaceId=%s', offerId, workspaceId || '(none)');
    try {
        if (!offerId) return res.status(400).json({ error: 'Offer ID is required.' });
        if (!config.tenant) return res.status(400).json({ error: 'ADOBE_TENANT is not set in .env.' });

        var accessToken = await getToken();
        var tenant = config.tenant;
        var workspaceIdStr = workspaceId || WORKSPACES[0].id;

        var result = await getOfferByIdContentOrJson(tenant, accessToken, offerId, workspaceIdStr);
        console.log('[Offer GET] ok=%s status=%s endpoint=%s', result.ok, result.status, result._endpoint || '');
        if (!result.ok) console.log('[Offer GET] body:', JSON.stringify(result.data).slice(0, 300));

        if (result.ok) {
            var foundId = await resolveFoundWorkspaceIdForOffer(tenant, accessToken, offerId, workspaceIdStr, true, result.data);
            var mismatch = workspaceId && String(foundId) !== String(workspaceIdStr);
            return res.json({
                offer: pickOfferDetailsForClient(result.data, { endpoint: result._endpoint }),
                foundInWorkspace: foundId,
                requestedWorkspaceId: workspaceId || undefined,
                workspaceMismatch: mismatch ? true : undefined
            });
        }

        if (result.status === 404 || result.status === 403) {
            for (var i = 0; i < WORKSPACES.length; i++) {
                var wsId = WORKSPACES[i].id;
                if (String(wsId) === String(workspaceIdStr)) continue;
                var next = await getOfferByIdContentOrJson(tenant, accessToken, offerId, wsId);
                if (next.ok) {
                    var foundId2 = await resolveFoundWorkspaceIdForOffer(tenant, accessToken, offerId, wsId, true, next.data);
                    var mismatch2 = workspaceId && String(foundId2) !== String(workspaceIdStr);
                    return res.json({
                        offer: pickOfferDetailsForClient(next.data, { endpoint: next._endpoint }),
                        foundInWorkspace: foundId2,
                        requestedWorkspaceId: workspaceId || undefined,
                        workspaceMismatch: mismatch2 ? true : undefined
                    });
                }
            }
        }

        var errMsg = result.data.message || result.data.error
            || (result.data.errors && result.data.errors[0] && result.data.errors[0].message)
            || (result.data.raw && String(result.data.raw).slice(0, 200))
            || 'Offer not found in any workspace.';
        return res.status(result.status).json({ error: errMsg });
    } catch (error) {
        console.error('[Offer GET] catch:', error.message || error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/offers/create — HTML Offer 생성
router.post('/create', async function (req, res) {
    try {
        var accessToken = await getToken();
        var tenant = config.tenant;
        var name = (req.body.name || '').trim();
        var content = (req.body.content || '').trim();
        var workspaceId = String(req.body.workspaceId || '').trim();

        if (!name || !content) {
            return res.status(400).json({ error: 'Offer name and content are required.' });
        }
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        }

        var workspaceIdStr = workspaceId || WORKSPACES[0].id;
        var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/offers/content?workspace=' + encodeURIComponent(workspaceIdStr);
        var payload = { name: name, content: content, workspace: workspaceIdStr };

        console.log('[Offer Create] url=%s payload=%s', apiUrl, JSON.stringify(payload).slice(0, 200));

        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'X-Admin-Workspace-Id': workspaceIdStr,
                'Content-Type': 'application/vnd.adobe.target.v2+json',
                'Accept': 'application/vnd.adobe.target.v2+json'
            },
            body: JSON.stringify(payload)
        });

        var responseText = await response.text();
        console.log('[Offer Create] status=%s body=%s', response.status, responseText.slice(0, 300));

        var data;
        try { data = JSON.parse(responseText); } catch (e) { data = { error: responseText || 'Failed to parse response' }; }

        if (!response.ok) {
            var errorMessage = data.message || data.error || data.error_description || responseText || 'Failed to create offer';
            return res.status(response.status).json({ error: errorMessage, details: data });
        }

        var offerId = data.id || data.offerId;
        console.log('[Offer Create] offerId=%s', offerId);
        addCreatedOffer(tenant, config.clientId, offerId, workspaceIdStr);
        res.json({ offerId: offerId, offer: data });
    } catch (error) {
        console.error('[Offer Create] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/offers/:id — Offer 수정 (이 앱이 만든 offer만 허용)
router.put('/:id', async function (req, res) {
    try {
        var offerId = String(req.params.id || '').trim();
        var name = (req.body.name || '').trim();
        var content = (req.body.content || '').trim();
        var workspaceId = String(req.query.workspaceId || req.body.workspaceId || '').trim();

        if (!offerId) return res.status(400).json({ error: 'Offer ID is required.' });
        if (!name && !content) return res.status(400).json({ error: 'name or content is required.' });

        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });

        // safety: only offers created by this app
        var meta = getCreatedOfferMetaById(tenant, config.clientId, offerId);
        if (!meta) return res.status(403).json({ error: 'Only offers created via this app can be updated.' });
        if (!workspaceId) workspaceId = meta.workspaceId || '';
        if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required for offer update.' });

        var accessToken = await getToken();

        // allow partial update: if missing name/content, fill from current offer
        if (!name || !content) {
            var current = await getOfferByIdContentOrJson(tenant, accessToken, offerId, workspaceId);
            if (!current.ok || !current.data) {
                return res.status(current.status || 500).json({
                    error: 'Failed to load current offer before update.',
                    details: current.data || null
                });
            }
            if (!name) name = String(current.data.name || '').trim();
            if (!content) content = String(current.data.content || '').trim();
            if (!name || !content) return res.status(400).json({ error: 'Resolved offer name/content are empty.' });
        }

        var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/offers/content/' + encodeURIComponent(offerId) + '?workspace=' + encodeURIComponent(workspaceId);
        var payload = { id: Number(offerId) || offerId, name: name, content: content, workspace: workspaceId };

        var r = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'X-Admin-Workspace-Id': workspaceId,
                'Content-Type': 'application/vnd.adobe.target.v2+json',
                'Accept': 'application/vnd.adobe.target.v2+json'
            },
            body: JSON.stringify(payload)
        });
        var text = await r.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
        if (!r.ok) {
            return res.status(r.status).json({ error: data.message || data.error || (data.errors && data.errors[0] && data.errors[0].message) || text || 'Failed to update offer', details: data });
        }
        res.json({ success: true, offerId: offerId, offer: data });
    } catch (error) {
        console.error('[Offer PUT] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/offers/:id — Offer 삭제 (이 앱이 만든 offer만 허용)
router.delete('/:id', async function (req, res) {
    try {
        var offerId = String(req.params.id || '').trim();
        var workspaceId = String(req.query.workspaceId || '').trim();
        if (!offerId) return res.status(400).json({ error: 'Offer ID is required.' });

        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });

        var meta = getCreatedOfferMetaById(tenant, config.clientId, offerId);
        if (!meta) return res.status(403).json({ error: 'Only offers created via this app can be deleted.' });
        if (!workspaceId) workspaceId = meta.workspaceId || '';
        if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required for offer delete.' });

        var accessToken = await getToken();
        var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/offers/content/' + encodeURIComponent(offerId) + '?workspace=' + encodeURIComponent(workspaceId);
        var r = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'X-Admin-Workspace-Id': workspaceId,
                'Accept': 'application/vnd.adobe.target.v2+json'
            }
        });
        var text = await r.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        if (!r.ok) {
            return res.status(r.status).json({ error: (data && (data.message || data.error || data.errors && data.errors[0] && data.errors[0].message)) || text || 'Failed to delete offer' });
        }
        removeFromCreatedOffers(tenant, config.clientId, offerId);
        res.json({ success: true, offerId: offerId });
    } catch (error) {
        console.error('[Offer DELETE] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
