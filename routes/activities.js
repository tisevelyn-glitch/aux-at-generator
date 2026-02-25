/**
 * Activity 라우트 — 생성 / 상태 변경
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, DEFAULT_WORKSPACE_ID, getToken, fetchPropertiesForWorkspace } = require('../lib/adobe');

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

        res.json({ activityId: data.id || data.activityId, activity: data });
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
