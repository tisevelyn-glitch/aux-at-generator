/**
 * Activity 라우트 — 목록 / 생성 / 상태 변경
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, DEFAULT_WORKSPACE_ID, getToken, fetchPropertiesForWorkspace } = require('../lib/adobe');
const { addCreated, getCreatedIdsForApi, removeFromCreated } = require('../lib/created-activities-store');

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
            var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/activities?workspace=' + encodeURIComponent(workspaceId);
            var response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'X-Api-Key': config.clientId,
                    'X-Admin-Workspace-Id': workspaceId,
                    'Accept': 'application/vnd.adobe.target.v1+json'
                }
            });
            var text = await response.text();
            var data;
            try { data = JSON.parse(text); } catch (e) { data = null; }
            if (!response.ok) {
                return res.status(response.status).json({ error: (data && (data.message || data.error)) || text || 'Failed to list activities' });
            }
            var activities = Array.isArray(data) ? data : (data.activities || data.content || data.items || []);
            var ws = WORKSPACES.find(function (w) { return String(w.id) === String(workspaceId); });
            var workspaceName = ws ? ws.name : workspaceId;
            activities = activities.map(function (a) {
                return Object.assign({}, a, { workspaceId: workspaceId, workspaceName: workspaceName });
            });
            var createdIds = getCreatedIdsForApi(tenant, config.clientId);
            activities = activities.filter(function (a) { return createdIds.has(String(a.id || a.activityId)); });
            return res.json({ activities: activities });
        }

        var all = [];
        for (var i = 0; i < WORKSPACES.length; i++) {
            var wsId = WORKSPACES[i].id;
            var wsName = WORKSPACES[i].name;
            var url = 'https://mc.adobe.io/' + tenant + '/target/activities?workspace=' + encodeURIComponent(wsId);
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
                var list = Array.isArray(body) ? body : (body.activities || body.content || body.items || []);
                list.forEach(function (a) {
                    all.push(Object.assign({}, a, { workspaceId: wsId, workspaceName: wsName }));
                });
            }
        }
        var createdIds = getCreatedIdsForApi(tenant, config.clientId);
        all = all.filter(function (a) { return createdIds.has(String(a.id || a.activityId)); });
        res.json({ activities: all });
    } catch (error) {
        console.error('[Activities list] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/activities/:id — 액티비티 단건 상세 (수정 폼용)
router.get('/:id', async function (req, res) {
    try {
        var activityId = req.params.id;
        if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        var accessToken = await getToken();
        var url = 'https://mc.adobe.io/' + tenant + '/target/activities/ab/' + encodeURIComponent(activityId);
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

// DELETE /api/activities/:id — 액티비티 삭제 (내가 등록한 것만: store에 있을 때만 삭제 후 store에서 제거)
router.delete('/:id', async function (req, res) {
    try {
        var activityId = req.params.id;
        if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
        var tenant = config.tenant;
        if (!tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        var createdIds = getCreatedIdsForApi(tenant, config.clientId);
        if (!createdIds.has(String(activityId))) {
            return res.status(403).json({ error: 'This activity was not registered by this app. Only activities you created via this app can be deleted here.' });
        }
        var accessToken = await getToken();
        var url = 'https://mc.adobe.io/' + tenant + '/target/activities/ab/' + encodeURIComponent(activityId);
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
        var getUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/ab/' + encodeURIComponent(activityId);
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
        var patchUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/ab/' + encodeURIComponent(activityId) + '?workspace=' + encodeURIComponent(workspaceId);
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

// POST /api/activities/create — A/B Test Activity 생성 (v3 API)
router.post('/create', async function (req, res) {
    try {
        var name = (req.body.name || '').trim();
        var offerId = req.body.offerId;
        var workspaceId = String(req.body.workspaceId || '').trim();
        var activityStatus = (req.body.activityStatus || '').trim();

        if (!name || !offerId) {
            return res.status(400).json({ error: 'Activity name and Offer ID are required.' });
        }
        var tenant = config.tenant;
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
        }

        var accessToken = await getToken();
        var workspaceIdStr = workspaceId || WORKSPACES[0].id;
        var isNonDefault = workspaceIdStr !== DEFAULT_WORKSPACE_ID;
        var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/activities/ab?workspace=' + encodeURIComponent(workspaceIdStr);

        var offerIdNum = Number(offerId) || offerId;
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
        var payload = {
            name: name || 'API_Test_Activity_' + Date.now(),
            state: state,
            priority: 5,
            workspace: workspaceIdStr,
            locations: { mboxes: [{ locationLocalId: 0, name: mboxName }] },
            options: [{ optionLocalId: 0, offerId: offerIdNum }],
            experiences: [
                { experienceLocalId: 0, name: 'Control', visitorPercentage: 50, optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] },
                { experienceLocalId: 1, name: 'Variation 1', visitorPercentage: 50, optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] }
            ],
            metrics: [
                { metricLocalId: 32767, name: 'Page Views', conversion: true, mboxes: [{ name: mboxName, successEvent: 'mbox_shown' }], action: { type: 'count_once' } }
            ]
        };
        if (propertyIds.length > 0) payload.propertyIds = propertyIds;

        console.log('[Activity Create] url=%s', apiUrl);

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
        res.json({ activityId: newId, activity: data });
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
