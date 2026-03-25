/**
 * Activity 라우트 — 목록 / 생성 / 상태 변경
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, DEFAULT_WORKSPACE_ID, getToken, fetchPropertiesForWorkspace, getActivityChangelog, changelogHasAuthor } = require('../lib/adobe');
const { addCreated, getCreatedIdsForApi, removeFromCreated } = require('../lib/created-activities-store');

var CONCURRENCY = 5;
var MAX_ACTIVITIES_FOR_CHANGELOG = 80;

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
 * CREATOR_EMAIL 설정 시 Changelog API로 작성자 필터 + createdVia(api|ui) 부여
 */
async function filterActivitiesByCreator(activities, accessToken, tenant, createdIds) {
    var creator = config.creatorImsUserId || config.creatorEmail;
    if (!creator || activities.length === 0) return activities;
    var list = activities.slice(0, MAX_ACTIVITIES_FOR_CHANGELOG);
    var result = [];
    for (var i = 0; i < list.length; i += CONCURRENCY) {
        var batch = list.slice(i, i + CONCURRENCY);
        var changelogs = await Promise.all(batch.map(function (a) {
            var id = a.id || a.activityId;
            return getActivityChangelog(tenant, accessToken, id).then(function (cl) {
                return { activity: a, changelog: cl };
            });
        }));
        for (var j = 0; j < changelogs.length; j++) {
            var item = changelogs[j];
            if (changelogHasAuthor(item.changelog, creator)) {
                var idStr = String(item.activity.id || item.activity.activityId);
                var createdVia = createdIds.has(idStr) ? 'api' : 'ui';
                result.push(Object.assign({}, item.activity, { createdVia: createdVia }));
            }
        }
    }
    if (activities.length > MAX_ACTIVITIES_FOR_CHANGELOG) {
        console.log('[Activities list] Filtered by creator: showing first ' + MAX_ACTIVITIES_FOR_CHANGELOG + ' of ' + activities.length);
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

// PUT /api/activities/:id/options — Variation 등 옵션의 Offer ID 변경
router.put('/:id/options', async function (req, res) {
    try {
        var activityId = req.params.id;
        var options = req.body.options;
        if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
        if (!Array.isArray(options) || options.length === 0) return res.status(400).json({ error: 'options array is required (e.g. [{ optionLocalId: 0, offerId: 123 }, ...]).' });
        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        var createdIds = getCreatedIdsForApi(tenant, config.clientId);
        if (!createdIds.has(String(activityId))) {
            return res.status(403).json({ error: 'Only activities created via this app can be updated.' });
        }
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
        var patchUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/' + typePath + '/' + encodeURIComponent(activityId) + '?workspace=' + encodeURIComponent(workspaceId);
        var patchR = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'X-Admin-Workspace-Id': String(workspaceId),
                'Content-Type': 'application/vnd.adobe.target.v3+json',
                'Accept': 'application/vnd.adobe.target.v3+json'
            },
            body: JSON.stringify({ options: mergedOptions })
        });
        var patchText = await patchR.text();
        var patchData;
        try { patchData = JSON.parse(patchText); } catch (e) { patchData = null; }
        if (!patchR.ok) {
            return res.status(patchR.status).json({ error: (patchData && (patchData.message || patchData.errors && patchData.errors[0] && patchData.errors[0].message)) || patchText || 'Failed to update options' });
        }
        res.json(patchData || { success: true });
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
        var propertyIds = [];
        if (isNonDefault) {
            propertyIds = await fetchPropertiesForWorkspace(accessToken, tenant, workspaceIdStr);
            console.log('[Activity] workspace=%s propertyIds=%s', workspaceIdStr, JSON.stringify(propertyIds));
            if (propertyIds.length === 0) {
                return res.status(400).json({
                    error: 'No properties found for this workspace. Non-default workspaces require at least one property.'
                });
            }
        }

        var state = activityStatus || 'saved';
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
            payload = {
                name: name || 'API_Test_Activity_' + Date.now(),
                state: state,
                priority: 5,
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
            // AB-M: Control + Variation with separate offers
            var effectiveControlOfferId = controlOfferId || offerId;
            var effectiveVariationOfferId = variationOfferId || offerId;
            if (!effectiveControlOfferId || !effectiveVariationOfferId) {
                return res.status(400).json({ error: 'AB-M requires controlOfferId and variationOfferId (or legacy offerId fallback).' });
            }

            var controlPct = clampPct(controlVisitorPct);
            var variationPct = clampPct(variationVisitorPct);
            // ensure sum=100 (Adobe may validate this)
            if (controlPct + variationPct !== 100) variationPct = 100 - controlPct;
            if (variationPct < 0) { variationPct = 0; controlPct = 100; }

            var controlOfferIdNum = Number(effectiveControlOfferId) || effectiveControlOfferId;
            var variationOfferIdNum = Number(effectiveVariationOfferId) || effectiveVariationOfferId;

            payload = {
                name: name || 'API_Test_Activity_' + Date.now(),
                state: state,
                priority: 5,
                workspace: workspaceIdStr,
                locations: { mboxes: [{ locationLocalId: 0, name: mboxName }] },
                options: [
                    { optionLocalId: 0, offerId: controlOfferIdNum },
                    { optionLocalId: 1, offerId: variationOfferIdNum }
                ],
                experiences: [
                    { experienceLocalId: 0, name: 'Control', visitorPercentage: controlPct, optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] },
                    { experienceLocalId: 1, name: 'Variation 1', visitorPercentage: variationPct, optionLocations: [{ locationLocalId: 0, optionLocalId: 1 }] }
                ],
                metrics: [
                    { metricLocalId: 32767, name: 'Page Views', conversion: true, mboxes: [{ name: mboxName, successEvent: 'mbox_shown' }], action: { type: 'count_once' } }
                ]
            };
        }
        if (propertyIds.length > 0) payload.propertyIds = propertyIds;

        console.log('[Activity Create] type=%s url=%s', typePath, apiUrl);

        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'X-Api-Key': config.clientId,
                'X-Admin-Workspace-Id': workspaceIdStr,
                'Content-Type': 'application/vnd.adobe.target.v3+json',
                'Accept': 'application/vnd.adobe.target.v3+json'
            },
            body: JSON.stringify(payload)
        });

        var responseText = await response.text();
        console.log('[Activity Create] status=%s body=%s', response.status, responseText.slice(0, 500));

        var data;
        try { data = JSON.parse(responseText); } catch (e) { data = { error: responseText || 'Failed to parse response' }; }

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
