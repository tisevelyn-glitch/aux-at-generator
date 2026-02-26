/**
 * Offer 라우트 — 조회 / 생성
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, getToken, getOfferById } = require('../lib/adobe');

// GET /api/offers/list — workspaceId 없으면 전체 워크스페이스 조회(각 항목에 workspace 정보 포함)
router.get('/list', async function (req, res) {
    try {
        var workspaceId = String(req.query.workspaceId || '').trim();
        var tenant = config.tenant;
        var accessToken = await getToken();
        if (!tenant || !config.clientId) {
            return res.status(400).json({ error: 'Tenant and ADOBE_CLIENT_ID required.' });
        }

        if (workspaceId) {
            var apiUrl = 'https://mc.adobe.io/' + tenant + '/target/offers/content?workspace=' + encodeURIComponent(workspaceId);
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
            var offers = Array.isArray(data) ? data : (data.content || data.offers || []);
            var ws = WORKSPACES.find(function (w) { return String(w.id) === String(workspaceId); });
            var workspaceName = ws ? ws.name : workspaceId;
            offers = offers.map(function (o) {
                return Object.assign({}, o, { workspaceId: workspaceId, workspaceName: workspaceName });
            });
            return res.json({ offers: offers });
        }

        var all = [];
        for (var i = 0; i < WORKSPACES.length; i++) {
            var wsId = WORKSPACES[i].id;
            var wsName = WORKSPACES[i].name;
            var url = 'https://mc.adobe.io/' + tenant + '/target/offers/content?workspace=' + encodeURIComponent(wsId);
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
                var list = Array.isArray(body) ? body : (body.content || body.offers || []);
                list.forEach(function (o) {
                    all.push(Object.assign({}, o, { workspaceId: wsId, workspaceName: wsName }));
                });
            }
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

        var result = await getOfferById(tenant, accessToken, offerId, workspaceIdStr);
        console.log('[Offer GET] ok=%s status=%s', result.ok, result.status);
        if (!result.ok) console.log('[Offer GET] body:', JSON.stringify(result.data).slice(0, 300));

        if (result.ok) {
            return res.json({
                offer: { id: result.data.id, name: result.data.name, content: result.data.content, workspace: result.data.workspace },
                foundInWorkspace: workspaceIdStr
            });
        }

        if (result.status === 404 || result.status === 403) {
            for (var i = 0; i < WORKSPACES.length; i++) {
                var wsId = WORKSPACES[i].id;
                if (String(wsId) === String(workspaceIdStr)) continue;
                var next = await getOfferById(tenant, accessToken, offerId, wsId);
                if (next.ok) {
                    return res.json({
                        offer: { id: next.data.id, name: next.data.name, content: next.data.content, workspace: next.data.workspace },
                        foundInWorkspace: wsId
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
        res.json({ offerId: offerId, offer: data });
    } catch (error) {
        console.error('[Offer Create] catch:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
