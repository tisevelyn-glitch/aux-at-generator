/**
 * Activity 라우트 — 목록 / 생성 / 상태 변경
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, DEFAULT_WORKSPACE_ID, getToken, getOfferByIdContentOrJson, fetchPropertiesForWorkspace, getActivityChangelog, changelogHasAuthor } = require('../lib/adobe');
const { addCreated, getCreatedIdsForApi, removeFromCreated } = require('../lib/created-activities-store');

var CONCURRENCY = 5;
var MAX_ACTIVITIES_FOR_CHANGELOG = 250;

/** propertyIds: 자동 | 본문 배열/문자열 | 생략(omit) */
function parsePropertyIdsFromBody(req) {
    if (req.body.omitPropertyIds === true || req.body.omitPropertyIds === 'true') {
        return { mode: 'omit', ids: [] };
    }
    var raw = req.body.propertyIds;
    if (raw == null || raw === '') {
        return { mode: 'auto', ids: null };
    }
    if (Array.isArray(raw)) {
        var ids = raw.map(function (x) { return Number(x); }).filter(function (n) { return !isNaN(n) && n > 0; });
        return ids.length ? { mode: 'override', ids: ids } : { mode: 'auto', ids: null };
    }
    if (typeof raw === 'string') {
        var parts = raw.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        var ids2 = parts.map(function (p) { return Number(p); }).filter(function (n) { return !isNaN(n) && n > 0; });
        return ids2.length ? { mode: 'override', ids: ids2 } : { mode: 'auto', ids: null };
    }
    return { mode: 'auto', ids: null };
}

async function assertOffersReadableInWorkspace(tenant, accessToken, workspaceIdStr, offerIdList) {
    var seen = {};
    for (var i = 0; i < offerIdList.length; i++) {
        var oid = offerIdList[i];
        if (oid == null || oid === '') continue;
        if (oid === 0 || oid === '0') continue;
        var key = String(oid);
        if (seen[key]) continue;
        seen[key] = true;
        var r = await getOfferByIdContentOrJson(tenant, accessToken, String(oid), workspaceIdStr);
        if (!r.ok) {
            var msg = (r.data && (r.data.message || r.data.error)) || ('HTTP ' + r.status);
            if (r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].message) {
                msg = r.data.errors[0].message;
            }
            return {
                ok: false,
                error: '워크스페이스에서 오퍼를 읽을 수 없습니다. offerId=' + key + ' — ' + msg
            };
        }
    }
    return { ok: true };
}

function clampActivityPriority(n) {
    n = Number(n);
    if (isNaN(n)) return 5;
    if (n < 0) return 0;
    if (n > 999) return 999;
    return Math.round(n);
}

function sameTargetOfferIdForAb(a, b) {
    var sa = String(a == null ? '' : a).trim();
    var sb = String(b == null ? '' : b).trim();
    if (sa === '' || sb === '') return false;
    if (sa === sb) return true;
    if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
        try {
            return BigInt(sa) === BigInt(sb);
        } catch (e) {
            return false;
        }
    }
    return false;
}

var AB_EXP_MIN = 2;
var AB_EXP_MAX = 5;

function trimOfferIdField(v) {
    if (v == null) return '';
    return String(v).trim();
}

/** Adobe Target v3: 기본 콘텐츠는 options[].offerId = 0 으로 표현되는 경우가 많음(커뮤니티/예제). */
function equalSplitPercentAb(n) {
    var base = Math.floor(100 / n);
    var rem = 100 - base * n;
    var arr = [];
    for (var i = 0; i < n; i++) {
        arr.push(base + (i < rem ? 1 : 0));
    }
    return arr;
}

function normalizeExperiencePercentages(rawPcts) {
    var n = rawPcts.length;
    var out = [];
    var i;
    for (i = 0; i < n; i++) {
        var p = Number(rawPcts[i]);
        if (isNaN(p)) p = 0;
        if (p < 0) p = 0;
        if (p > 100) p = 100;
        out.push(Math.round(p));
    }
    var sum = 0;
    for (i = 0; i < n; i++) sum += out[i];
    if (sum === 0) {
        return equalSplitPercentAb(n);
    }
    if (sum !== 100) {
        var rest = 0;
        for (i = 0; i < n - 1; i++) rest += out[i];
        out[n - 1] = 100 - rest;
        if (out[n - 1] < 0) out[n - 1] = 0;
        if (out[n - 1] > 100) out[n - 1] = 100;
    }
    return out;
}

/**
 * abExperiences: [{ name?, visitorPct, offerId?, defaultContent? }]
 * defaultContent true → offerId 0 (기본 콘텐츠)
 */
function buildAbMultiExperiencePayload(name, state, workspaceIdStr, mboxName, abList, priorityNum) {
    var n = abList.length;
    var options = [];
    var experiences = [];
    var i;
    for (i = 0; i < n; i++) {
        var row = abList[i];
        var offerNum = row.offerIdNum;
        options.push({ optionLocalId: i, offerId: offerNum });
        experiences.push({
            experienceLocalId: i,
            name: row.name,
            visitorPercentage: row.visitorPct,
            optionLocations: [{ locationLocalId: 0, optionLocalId: i }]
        });
    }
    var pr = priorityNum;
    if (pr == null || isNaN(Number(pr))) pr = 5;
    pr = Math.round(Number(pr));
    if (pr < 0) pr = 0;
    if (pr > 999) pr = 999;
    return {
        name: name || 'API_Test_Activity_' + Date.now(),
        state: state,
        priority: pr,
        workspace: workspaceIdStr,
        locations: { mboxes: [{ locationLocalId: 0, name: mboxName }] },
        options: options,
        experiences: experiences,
        metrics: [
            { metricLocalId: 32767, name: 'Page Views', conversion: true, mboxes: [{ name: mboxName, successEvent: 'mbox_shown' }], action: { type: 'count_once' } }
        ]
    };
}

function isOfferWorkspaceAccessibilityError(data) {
    var errs = data && data.errors;
    if (!Array.isArray(errs)) return false;
    for (var i = 0; i < errs.length; i++) {
        var e = errs[i] || {};
        var code = String(e.errorCode || '');
        var msg = String(e.message || '');
        if (code.indexOf('OfferId') !== -1 && msg.indexOf('not accessible') !== -1) return true;
        if (msg.indexOf('Offer not accessible') !== -1) return true;
    }
    return false;
}

/**
 * AB + XT activity 목록 병합 (각각 activityType 부여)
 * - ab → AB-M, Experience Cloud URL: ab_manual
 * - xt → XT, Experience Cloud URL: experience_targeting
 * ab/xt 엔드포인트 실패 시 generic /target/activities 폴백 (activityType 기본 ab)
 */
async function fetchActivitiesByWorkspace(tenant, accessToken, workspaceId) {
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
        } catch (e) {
            console.warn('[Activities list] ' + typePath + ' fetch failed:', e.message);
        }
    }
    if (all.length === 0) {
        var fallbackUrl = 'https://mc.adobe.io/' + tenant + '/target/activities?workspace=' + encodeURIComponent(workspaceId);
        try {
            var r = await fetch(fallbackUrl, { method: 'GET', headers: headers });
            var body;
            try { body = JSON.parse(await r.text()); } catch (e) { body = null; }
            if (r.ok && body) {
                var list = Array.isArray(body) ? body : (body.activities || body.content || body.items || []);
                list.forEach(function (a) {
                    var t = (a.type || a.activityType || 'ab').toLowerCase();
                    all.push(Object.assign({}, a, { activityType: t === 'xt' ? 'xt' : 'ab' }));
                });
            }
        } catch (e) {
            console.warn('[Activities list] fallback fetch failed:', e.message);
        }
    }
    return all;
}

/** 단건 GET 응답에서 workspace 메타 보강 */
function activityWorkspaceFieldsFromRow(a) {
    var wsId = a.workspace != null ? String(a.workspace) : (a.workspaceId != null ? String(a.workspaceId) : '');
    var ws = WORKSPACES.find(function (w) { return String(w.id) === wsId; });
    return {
        workspaceId: wsId || undefined,
        workspaceName: ws ? ws.name : (wsId || '—')
    };
}

/**
 * 목록 API에 아직 안 나오는 등록 ID(지연·페이지 등)는 ab/xt 단건 GET으로 보강.
 */
async function fetchActivityByIdForList(tenant, accessToken, activityIdStr) {
    var headers = {
        'Authorization': 'Bearer ' + accessToken,
        'X-Api-Key': config.clientId,
        'Accept': 'application/vnd.adobe.target.v3+json'
    };
    var paths = ['ab', 'xt'];
    for (var p = 0; p < paths.length; p++) {
        var typePath = paths[p];
        var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '/' + encodeURIComponent(activityIdStr);
        try {
            var r = await fetch(url, { method: 'GET', headers: headers });
            var text = await r.text();
            var data;
            try { data = JSON.parse(text); } catch (e) { data = null; }
            if (r.ok && data) {
                return Object.assign({}, data, { activityType: typePath });
            }
        } catch (e) {
            console.warn('[Activities list] single GET ' + activityIdStr + ' (' + typePath + '):', e.message);
        }
    }
    return null;
}

/**
 * created-activities에만 있고 워크스페이스 목록 합집합에 없는 ID를 단건 조회로 추가.
 * @param {string} [onlyWorkspaceId] — 지정 시 해당 워크스페이스에 속한 항목만 추가
 */
async function hydrateCreatedActivitiesNotInList(all, tenant, accessToken, createdIds, onlyWorkspaceId) {
    if (!createdIds || createdIds.size === 0) return all;
    var seen = new Set();
    all.forEach(function (a) {
        var id = String(a.id || a.activityId);
        if (id) seen.add(id);
    });
    var extra = [];
    for (var idStr of createdIds) {
        if (seen.has(idStr)) continue;
        var row = await fetchActivityByIdForList(tenant, accessToken, idStr);
        if (!row) {
            console.warn('[Activities list] id ' + idStr + ' registered but not in list and single GET failed.');
            continue;
        }
        var w = activityWorkspaceFieldsFromRow(row);
        if (onlyWorkspaceId != null && String(onlyWorkspaceId) !== String(w.workspaceId || '')) continue;
        extra.push(Object.assign({}, row, {
            workspaceId: w.workspaceId,
            workspaceName: w.workspaceName,
            activityType: row.activityType || 'ab'
        }));
        seen.add(idStr);
    }
    return extra.length ? all.concat(extra) : all;
}

// GET /api/activities/list — workspaceId 없으면 전체 워크스페이스 조회(각 항목에 workspace 정보 포함)
router.get('/list', async function (req, res) {
    try {
        var workspaceId = String(req.query.workspaceId || '').trim();
        var tenant = config.tenant;
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        }
        var accessToken = await getToken();

        if (workspaceId) {
            var activities = await fetchActivitiesByWorkspace(tenant, accessToken, workspaceId);
            var ws = WORKSPACES.find(function (w) { return String(w.id) === String(workspaceId); });
            var workspaceName = ws ? ws.name : workspaceId;
            activities = activities.map(function (a) {
                return Object.assign({}, a, { workspaceId: workspaceId, workspaceName: workspaceName });
            });
            var createdIds = getCreatedIdsForApi(tenant, config.clientId);
            activities = await hydrateCreatedActivitiesNotInList(activities, tenant, accessToken, createdIds, workspaceId);
            if (config.creatorEmail || config.creatorImsUserId) {
                activities = await filterActivitiesByCreator(activities, accessToken, tenant, createdIds);
            } else {
                activities = activities.filter(function (a) { return createdIds.has(String(a.id || a.activityId)); });
                activities = activities.map(function (a) {
                    return Object.assign({}, a, { createdVia: 'api' });
                });
            }
            return res.json({ activities: activities });
        }

        var all = [];
        for (var i = 0; i < WORKSPACES.length; i++) {
            var wsId = WORKSPACES[i].id;
            var wsName = WORKSPACES[i].name;
            var list = await fetchActivitiesByWorkspace(tenant, accessToken, wsId);
            list.forEach(function (a) {
                all.push(Object.assign({}, a, { workspaceId: wsId, workspaceName: wsName }));
            });
        }
        var createdIds = getCreatedIdsForApi(tenant, config.clientId);
        all = await hydrateCreatedActivitiesNotInList(all, tenant, accessToken, createdIds, null);
        if (config.creatorEmail || config.creatorImsUserId) {
            all = await filterActivitiesByCreator(all, accessToken, tenant, createdIds);
        } else {
            all = all.filter(function (a) { return createdIds.has(String(a.id || a.activityId)); });
            all = all.map(function (a) {
                return Object.assign({}, a, { createdVia: 'api' });
            });
        }
        res.json({ activities: all });
    } catch (error) {
        console.error('[Activities list] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * CREATOR_EMAIL 설정 시 Changelog API로 작성자 필터 + createdVia(api|ui) 부여.
 * 이 앱으로 생성해 created-activities에 등록된 ID는 Changelog에 작성자가 안 잡혀도 항상 포함한다.
 */
async function filterActivitiesByCreator(activities, accessToken, tenant, createdIds) {
    var creator = config.creatorImsUserId || config.creatorEmail;
    if (!creator || activities.length === 0) return activities;
    var byId = {};
    activities.forEach(function (a) {
        var id = String(a.id || a.activityId);
        if (!id) return;
        byId[id] = a;
    });
    var result = [];
    var seen = new Set();
    if (createdIds && createdIds.size) {
        createdIds.forEach(function (idStr) {
            if (seen.has(idStr)) return;
            var a = byId[idStr];
            if (a) {
                seen.add(idStr);
                result.push(Object.assign({}, a, { createdVia: 'api' }));
            }
        });
    }
    var list = activities.slice(0, MAX_ACTIVITIES_FOR_CHANGELOG);
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
            if (changelogHasAuthor(item.changelog, creator)) {
                var idStr = String(item.activity.id || item.activity.activityId);
                if (seen.has(idStr)) continue;
                seen.add(idStr);
                var createdVia = createdIds && createdIds.has(idStr) ? 'api' : 'ui';
                result.push(Object.assign({}, item.activity, { createdVia: createdVia }));
            }
        }
    }
    if (activities.length > MAX_ACTIVITIES_FOR_CHANGELOG) {
        console.log('[Activities list] Filtered by creator: changelogs only for first ' + MAX_ACTIVITIES_FOR_CHANGELOG + ' of ' + activities.length + '; api-created ids merged from full list.');
    }
    return result;
}

// GET /api/activities/:id — 액티비티 단건 상세 (수정 폼용)
// activityType=ab|xt 쿼리 지원 (기본 ab). URL 경로: ab → ab, xt → xt
router.get('/:id', async function (req, res) {
    try {
        var activityId = req.params.id;
        if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        var accessToken = await getToken();
        var typePath = (req.query.activityType || 'ab').toLowerCase() === 'xt' ? 'xt' : 'ab';
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
        if (!r.ok) return res.status(r.status).json({ error: (data && (data.message || data.errors && data.errors[0] && data.errors[0].message)) || text || 'Failed to get activity' });
        res.json(data);
    } catch (error) {
        console.error('[Activity GET] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/activities/:id — 액티비티 삭제
// - 기본 안전장치: created-activities-store에 등록된(이 앱이 생성했다고 기록된) 것만 삭제
// - 추가 허용: .env에 CREATOR_EMAIL 또는 CREATOR_IMS_USER_ID가 설정된 경우,
//            삭제 직전에 changelog를 조회해 해당 작성자/수정자 이력이 있으면 삭제 허용
router.delete('/:id', async function (req, res) {
    try {
        var activityId = req.params.id;
        if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        var createdIds = getCreatedIdsForApi(tenant, config.clientId);
        var idStr = String(activityId);

        // 1) store에 등록된 건 항상 허용
        var allowDelete = createdIds.has(idStr);

        // 2) 작성자(creator) 기반 허용: changelog에 CREATOR가 포함되면 허용
        var creator = config.creatorImsUserId || config.creatorEmail;
        var accessToken = await getToken();
        if (!allowDelete && creator) {
            var cl = await getActivityChangelog(tenant, accessToken, idStr);
            if (changelogHasAuthor(cl, creator)) {
                allowDelete = true;
            }
        }

        if (!allowDelete) {
            if (creator) {
                return res.status(403).json({
                    error: 'This activity is not deletable by this app. It is not registered in this app store and its changelog does not match CREATOR_EMAIL/CREATOR_IMS_USER_ID.'
                });
            }
            return res.status(403).json({
                error: 'This activity was not registered by this app. Only activities registered by this app can be deleted here. (Tip: set CREATOR_EMAIL or CREATOR_IMS_USER_ID to enable creator-based deletion.)'
            });
        }

        var typePath = (req.query.activityType || 'ab').toLowerCase() === 'xt' ? 'xt' : 'ab';
        var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '/' + encodeURIComponent(activityId);
        var r = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'Accept': 'application/vnd.adobe.target.v3+json'
            }
        });
        var text = await r.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        if (!r.ok) {
            return res.status(r.status).json({ error: (data && (data.message || data.errors && data.errors[0] && data.errors[0].message)) || text || 'Failed to delete activity' });
        }
        // store에 있던 항목이면 정리 (creator 기반 삭제로 들어온 경우엔 no-op)
        removeFromCreated(tenant, config.clientId, activityId);
        res.json({ success: true, activityId: activityId });
    } catch (error) {
        console.error('[Activity DELETE] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/activities/:id/options — Variation 등 옵션의 Offer ID 변경, priority(선택) 동시 반영
router.put('/:id/options', async function (req, res) {
    try {
        var activityId = req.params.id;
        var options = req.body.options;
        if (!Array.isArray(options)) options = [];
        var hasPriorityUpdate = req.body && Object.prototype.hasOwnProperty.call(req.body, 'priority') && req.body.priority !== null && req.body.priority !== '';
        if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
        if (options.length === 0 && !hasPriorityUpdate) {
            return res.status(400).json({ error: 'options array and/or priority is required.' });
        }
        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        var createdIds = getCreatedIdsForApi(tenant, config.clientId);
        var idStr = String(activityId);
        var accessToken = await getToken();
        var typePath = (req.query.activityType || 'ab').toLowerCase() === 'xt' ? 'xt' : 'ab';
        var getUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '/' + encodeURIComponent(activityId);
        var getR = await fetch(getUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'Accept': 'application/vnd.adobe.target.v3+json'
            }
        });
        var getText = await getR.text();
        var activity;
        try { activity = JSON.parse(getText); } catch (e) { activity = null; }
        if (!getR.ok || !activity) {
            return res.status(getR.ok ? 500 : getR.status).json({ error: 'Failed to load activity for update.' });
        }
        var workspaceId = activity.workspace || activity.workspaceId;
        var allowUpdate = createdIds.has(idStr);
        if (!allowUpdate) {
            var creator = config.creatorImsUserId || config.creatorEmail;
            if (creator) {
                var cl = await getActivityChangelog(tenant, accessToken, activityId, workspaceId);
                if (changelogHasAuthor(cl, creator)) allowUpdate = true;
            }
        }
        if (!allowUpdate) {
            return res.status(403).json({
                error: 'This activity cannot be updated here. It must be registered as created by this app, or its changelog must match CREATOR_EMAIL / CREATOR_IMS_USER_ID.'
            });
        }
        var existingOptions = activity.options || [];
        var optionMap = {};
        existingOptions.forEach(function (o) { optionMap[String(o.optionLocalId)] = o; });
        options.forEach(function (o) {
            var lid = o.optionLocalId;
            var offerId = o.offerId != null ? (Number(o.offerId) || o.offerId) : null;
            if (lid != null && offerId != null && optionMap[String(lid)]) {
                optionMap[String(lid)].offerId = offerId;
            }
        });
        var mergedOptions = existingOptions.map(function (o) {
            var updated = optionMap[String(o.optionLocalId)];
            return updated ? Object.assign({}, o, { offerId: updated.offerId }) : o;
        });
        // Adobe Target v3: 단일 리소스에 PATCH는 지원되지 않음(405). GET 본문에 병합 후 PUT.
        var putBody;
        try {
            putBody = JSON.parse(JSON.stringify(activity));
        } catch (e) {
            putBody = Object.assign({}, activity);
        }
        putBody.options = mergedOptions;
        if (hasPriorityUpdate) {
            putBody.priority = clampActivityPriority(req.body.priority);
        }
        delete putBody.links;
        delete putBody._links;
        var putUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '/' + encodeURIComponent(activityId) + '?workspace=' + encodeURIComponent(workspaceId);
        var putR = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'X-Admin-Workspace-Id': String(workspaceId),
                'Content-Type': 'application/vnd.adobe.target.v3+json',
                'Accept': 'application/vnd.adobe.target.v3+json'
            },
            body: JSON.stringify(putBody)
        });
        var putText = await putR.text();
        var putData;
        try { putData = JSON.parse(putText); } catch (e) { putData = null; }
        if (!putR.ok) {
            return res.status(putR.status).json({
                error: (putData && (putData.message || putData.errors && putData.errors[0] && putData.errors[0].message)) || putText || 'Failed to update activity',
                details: putData || putText
            });
        }
        var payload = putData && typeof putData === 'object' ? putData : { success: true };
        if (hasPriorityUpdate && (payload.priority == null || payload.priority === undefined)) {
            payload.priority = putBody.priority;
        }
        res.json(payload);
    } catch (error) {
        console.error('[Activity options PUT] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/activities/remove-from-mine — "내 목록"에서 제외 (리스트에 더 이상 노출 안 함)
router.post('/remove-from-mine', function (req, res) {
    try {
        var activityId = req.body.activityId;
        if (activityId == null || activityId === '') {
            return res.status(400).json({ error: 'activityId is required.' });
        }
        var tenant = config.tenant;
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        }
        removeFromCreated(tenant, config.clientId, activityId);
        res.json({ success: true, activityId: activityId });
    } catch (error) {
        console.error('[Activities remove-from-mine] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/activities/create — Activity 생성 (v3 API)
// activityType: ab (AB-M) | xt (XT)
router.post('/create', async function (req, res) {
    try {
        var name = (req.body.name || '').trim();
        var workspaceId = String(req.body.workspaceId || '').trim();
        var activityStatus = (req.body.activityStatus || '').trim();
        var activityType = ((req.body.activityType || 'ab') + '').toLowerCase();
        if (activityType !== 'xt') activityType = 'ab';

        // Backward compatible fields (offerId) + new traffic-mapping fields
        var offerId = req.body.offerId; // fallback (legacy)
        var controlOfferId = req.body.controlOfferId;
        var variationOfferId = req.body.variationOfferId;
        var experienceOfferId = req.body.experienceOfferId;
        var controlVisitorPct = req.body.controlVisitorPct;
        var variationVisitorPct = req.body.variationVisitorPct;

        if (!name) {
            return res.status(400).json({ error: 'Activity name is required.' });
        }
        var tenant = config.tenant;
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        }

        var accessToken = await getToken();
        var workspaceIdStr = workspaceId || WORKSPACES[0].id;
        var isNonDefault = workspaceIdStr !== DEFAULT_WORKSPACE_ID;
        var typePath = activityType === 'xt' ? 'xt' : 'ab';
        var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '?workspace=' + encodeURIComponent(workspaceIdStr);
        var propParse = parsePropertyIdsFromBody(req);
        var propertyIds = [];
        if (isNonDefault) {
            if (propParse.mode === 'omit') {
                console.log('[Activity] workspace=%s propertyIds=OMITTED (client request)', workspaceIdStr);
            } else if (propParse.mode === 'override' && propParse.ids && propParse.ids.length) {
                propertyIds = propParse.ids;
                console.log('[Activity] workspace=%s propertyIds override=%s', workspaceIdStr, JSON.stringify(propertyIds));
            } else {
                propertyIds = await fetchPropertiesForWorkspace(accessToken, tenant, workspaceIdStr);
                console.log('[Activity] workspace=%s propertyIds auto=%s', workspaceIdStr, JSON.stringify(propertyIds));
                if (propertyIds.length === 0) {
                    return res.status(400).json({
                        error: 'No properties found for this workspace. Non-default workspaces require at least one property, or send propertyIds / omitPropertyIds.'
                    });
                }
            }
        }

        var state = activityStatus || 'saved';
        var priorityVal = clampActivityPriority(req.body.priority);
        var mboxName = 'default';
        // pct helper
        function clampPct(n) {
            n = Number(n);
            if (isNaN(n)) return 50;
            if (n < 0) return 0;
            if (n > 100) return 100;
            return n;
        }

        var payload;
        if (activityType === 'xt') {
            // XT: currently creates a single Experience (Experience 1)
            var effectiveExperienceOfferId = experienceOfferId || offerId;
            if (!effectiveExperienceOfferId) {
                return res.status(400).json({ error: 'XT requires experienceOfferId (or legacy offerId).' });
            }
            var offerIdNum = Number(effectiveExperienceOfferId) || effectiveExperienceOfferId;

            var preXt = await assertOffersReadableInWorkspace(tenant, accessToken, workspaceIdStr, [offerIdNum]);
            if (!preXt.ok) {
                return res.status(400).json({ error: preXt.error });
            }

            payload = {
                name: name || 'API_Test_Activity_' + Date.now(),
                state: state,
                priority: priorityVal,
                workspace: workspaceIdStr,
                locations: { mboxes: [{ locationLocalId: 0, name: mboxName }] },
                options: [{ optionLocalId: 0, offerId: offerIdNum }],
                experiences: [
                    { experienceLocalId: 0, name: 'Experience 1', optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] }
                ],
                metrics: [
                    { metricLocalId: 32767, name: 'Page Views', conversion: true, mboxes: [{ name: mboxName, successEvent: 'mbox_shown' }], action: { type: 'count_once' } }
                ]
            };
        } else {
            // AB-M: abExperiences(2–5) 또는 레거시 control/variation 2슬롯
            var abExperiencesRaw = req.body.abExperiences;
            var useMultiAb = Array.isArray(abExperiencesRaw)
                && abExperiencesRaw.length >= AB_EXP_MIN
                && abExperiencesRaw.length <= AB_EXP_MAX;

            if (useMultiAb) {
                var rows = [];
                var ii;
                for (ii = 0; ii < abExperiencesRaw.length; ii++) {
                    var item = abExperiencesRaw[ii] || {};
                    var dc = item.defaultContent === true || item.defaultContent === 'true' || item.defaultContent === 1;
                    var oidTrim = trimOfferIdField(item.offerId);
                    var expName = trimOfferIdField(item.name);
                    if (!expName) expName = 'Experience ' + String.fromCharCode(65 + ii);
                    var effStr;
                    if (dc) {
                        effStr = '0';
                    } else if (oidTrim === '0') {
                        effStr = '0';
                    } else if (oidTrim) {
                        effStr = oidTrim;
                    } else {
                        return res.status(400).json({
                            error: 'AB-M Experience ' + (ii + 1) + ' 에는 offerId 또는 defaultContent(기본 콘텐츠)가 필요합니다.',
                            detail: { index: ii }
                        });
                    }
                    rows.push({
                        name: expName,
                        effectiveStr: effStr,
                        rawPct: item.visitorPct
                    });
                }
                var zeroRowCount = 0;
                for (ii = 0; ii < rows.length; ii++) {
                    if (rows[ii].effectiveStr === '0') zeroRowCount++;
                }
                if (zeroRowCount > 1) {
                    return res.status(400).json({
                        error: '기본 콘텐츠(offerId 0)는 한 Experience만 지정할 수 있습니다.',
                        detail: { zeroRowCount: zeroRowCount }
                    });
                }
                var pctsNorm = normalizeExperiencePercentages(rows.map(function (r) { return r.rawPct; }));
                for (ii = 0; ii < rows.length; ii++) {
                    rows[ii].visitorPct = pctsNorm[ii];
                    rows[ii].offerIdNum = rows[ii].effectiveStr === '0' ? 0 : (Number(rows[ii].effectiveStr) || rows[ii].effectiveStr);
                }
                for (ii = 0; ii < rows.length; ii++) {
                    var jj;
                    for (jj = ii + 1; jj < rows.length; jj++) {
                        if (sameTargetOfferIdForAb(rows[ii].effectiveStr, rows[jj].effectiveStr)) {
                            return res.status(400).json({
                                error: 'AB-M에서는 서로 다른 Offer ID가 필요합니다. (기본 콘텐츠 offerId 0은 한 Experience만)',
                                detail: {
                                    effectiveA: rows[ii].effectiveStr,
                                    effectiveB: rows[jj].effectiveStr,
                                    names: [rows[ii].name, rows[jj].name]
                                }
                            });
                        }
                    }
                }
                var fetchIds = [];
                for (ii = 0; ii < rows.length; ii++) {
                    if (rows[ii].effectiveStr !== '0') fetchIds.push(rows[ii].offerIdNum);
                }
                var preAbMulti = await assertOffersReadableInWorkspace(tenant, accessToken, workspaceIdStr, fetchIds);
                if (!preAbMulti.ok) {
                    return res.status(400).json({ error: preAbMulti.error });
                }
                payload = buildAbMultiExperiencePayload(name, state, workspaceIdStr, mboxName, rows, priorityVal);
            } else if (Array.isArray(abExperiencesRaw) && abExperiencesRaw.length > 0) {
                return res.status(400).json({
                    error: 'abExperiences는 ' + AB_EXP_MIN + '–' + AB_EXP_MAX + '개이거나, 레거시 필드(controlOfferId·variationOfferId)를 사용하세요.'
                });
            } else {
                // 레거시: Experience A/B에 해당 — controlOfferId, variationOfferId, 레거시 offerId
                var ctrlTrim = trimOfferIdField(controlOfferId);
                var varTrim = trimOfferIdField(variationOfferId);
                var legacyTrim = trimOfferIdField(offerId);

                var effectiveControlOfferId = ctrlTrim;
                if (!effectiveControlOfferId && legacyTrim) {
                    if (!(varTrim && legacyTrim === varTrim)) {
                        effectiveControlOfferId = legacyTrim;
                    }
                }
                var effectiveVariationOfferId = varTrim || legacyTrim;

                if (!effectiveControlOfferId || !effectiveVariationOfferId) {
                    return res.status(400).json({
                        error: 'AB-M requires controlOfferId and variationOfferId (또는 레거시 offerId). Experience A Offer ID가 비어 있으면 클라이언트에서 검색/생성 오퍼 ID를 보내야 합니다.',
                        detail: { controlOfferId: controlOfferId, variationOfferId: variationOfferId, offerId: offerId }
                    });
                }

                var controlPct = clampPct(controlVisitorPct);
                var variationPct = clampPct(variationVisitorPct);
                if (controlPct + variationPct !== 100) variationPct = 100 - controlPct;
                if (variationPct < 0) { variationPct = 0; controlPct = 100; }

                var controlOfferIdNum = Number(effectiveControlOfferId) || effectiveControlOfferId;
                var variationOfferIdNum = Number(effectiveVariationOfferId) || effectiveVariationOfferId;

                if (sameTargetOfferIdForAb(effectiveControlOfferId, effectiveVariationOfferId)) {
                    return res.status(400).json({
                        error: 'AB-M에서는 서로 다른 Offer ID가 필요합니다. 지금 동일한 ID로 요청되고 있습니다.',
                        detail: {
                            effectiveControlOfferId: effectiveControlOfferId,
                            effectiveVariationOfferId: effectiveVariationOfferId,
                            raw: { controlOfferId: controlOfferId, variationOfferId: variationOfferId, offerId: offerId }
                        }
                    });
                }

                var preAb = await assertOffersReadableInWorkspace(tenant, accessToken, workspaceIdStr, [controlOfferIdNum, variationOfferIdNum]);
                if (!preAb.ok) {
                    return res.status(400).json({ error: preAb.error });
                }

                payload = {
                    name: name || 'API_Test_Activity_' + Date.now(),
                    state: state,
                    priority: priorityVal,
                    workspace: workspaceIdStr,
                    locations: { mboxes: [{ locationLocalId: 0, name: mboxName }] },
                    options: [
                        { optionLocalId: 0, offerId: controlOfferIdNum },
                        { optionLocalId: 1, offerId: variationOfferIdNum }
                    ],
                    experiences: [
                        { experienceLocalId: 0, name: 'Experience A', visitorPercentage: controlPct, optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] },
                        { experienceLocalId: 1, name: 'Experience B', visitorPercentage: variationPct, optionLocations: [{ locationLocalId: 0, optionLocalId: 1 }] }
                    ],
                    metrics: [
                        { metricLocalId: 32767, name: 'Page Views', conversion: true, mboxes: [{ name: mboxName, successEvent: 'mbox_shown' }], action: { type: 'count_once' } }
                    ]
                };
            }
        }
        if (propertyIds.length > 0) payload.propertyIds = propertyIds;

        console.log('[Activity Create] type=%s url=%s', typePath, apiUrl);

        function postActivity(bodyPayload) {
            return fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'X-Api-Key': config.clientId,
                    'X-Admin-Workspace-Id': workspaceIdStr,
                    'Content-Type': 'application/vnd.adobe.target.v3+json',
                    'Accept': 'application/vnd.adobe.target.v3+json'
                },
                body: JSON.stringify(bodyPayload)
            });
        }

        var response = await postActivity(payload);
        var responseText = await response.text();
        console.log('[Activity Create] status=%s body=%s', response.status, responseText.slice(0, 500));

        var data;
        try { data = JSON.parse(responseText); } catch (e) { data = { error: responseText || 'Failed to parse response' }; }

        if (!response.ok && isNonDefault && payload.propertyIds && payload.propertyIds.length > 0 && isOfferWorkspaceAccessibilityError(data)) {
            console.log('[Activity Create] retry without propertyIds (Offer not accessible with auto/mapped properties)');
            var payloadRetry = JSON.parse(JSON.stringify(payload));
            delete payloadRetry.propertyIds;
            response = await postActivity(payloadRetry);
            responseText = await response.text();
            console.log('[Activity Create] retry status=%s body=%s', response.status, responseText.slice(0, 500));
            try { data = JSON.parse(responseText); } catch (e2) { data = { error: responseText || 'Failed to parse response' }; }
        }

        if (!response.ok) {
            var errParts = data.message || data.error || data.error_description || responseText || 'Failed to create activity';
            return res.status(response.status).json({ error: errParts, details: data });
        }

        var newId = data.id || data.activityId;
        addCreated(tenant, config.clientId, newId);
        res.json({ activityId: newId, activityType: activityType, activity: data });
    } catch (error) {
        console.error('[Activity Create] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/activities/state — 상태 변경
router.put('/state', async function (req, res) {
    try {
        var activityId = req.body.activityId;
        var state = (req.body.state || '').trim();

        if (!activityId || !state) {
            return res.status(400).json({ error: 'Activity ID and state are required.' });
        }
        if (['saved', 'archived', 'approved', 'live'].indexOf(state) === -1) {
            return res.status(400).json({ error: 'Invalid state. Use: saved, archived, approved, or live' });
        }

        var tenant = config.tenant;
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        }

        var accessToken = await getToken();
        var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/' + activityId + '/state';

        var response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'Content-Type': 'application/vnd.adobe.target.v1+json'
            },
            body: JSON.stringify({ state: state })
        });

        var data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || data.error || 'Failed to update activity state' });
        }

        res.json({ success: true, activityId: activityId, state: state, data: data });
    } catch (error) {
        console.error('[Activity State] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
