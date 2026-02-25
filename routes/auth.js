/**
 * Auth / Config / Workspaces 라우트
 */
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { config, WORKSPACES, IMS_TOKEN_URL } = require('../lib/adobe');

// GET /api/workspaces
router.get('/workspaces', function (req, res) {
    res.json({ workspaces: WORKSPACES });
});

// GET /api/config
router.get('/config', function (req, res) {
    var hasToken = !!config.accessToken;
    var hasCreds = !!(config.clientId && config.clientSecret);
    var hasTenant = !!config.tenant;
    var hasConfig = hasTenant && (hasToken || hasCreds);
    res.json({
        hasConfig: hasConfig,
        clientId: config.clientId || '',
        tenant: config.tenant || '',
        missingFields: hasConfig ? [] : [
            !config.tenant && 'ADOBE_TENANT',
            !config.accessToken && !config.clientId && 'ADOBE_CLIENT_ID',
            !config.accessToken && !config.clientSecret && 'ADOBE_CLIENT_SECRET'
        ].filter(Boolean)
    });
});

// POST /api/auth/token
router.post('/auth/token', async function (req, res) {
    try {
        if (config.accessToken) {
            return res.json({ accessToken: config.accessToken, expiresIn: 86400 });
        }
        if (!config.clientId || !config.clientSecret || !config.tenant) {
            return res.status(400).json({
                error: 'Set ADOBE_ACCESS_TOKEN in .env, or ADOBE_CLIENT_ID + ADOBE_CLIENT_SECRET + ADOBE_TENANT.'
            });
        }

        var params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', config.clientId);
        params.append('client_secret', config.clientSecret);
        params.append('scope', 'openid,AdobeID,target_sdk,read_organizations,additional_info.projectedProductContext');

        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 25000);

        var response = await fetch(IMS_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
            signal: controller.signal
        }).finally(function () { clearTimeout(timeoutId); });

        var ct = response.headers.get('content-type') || '';
        var data;
        if (ct.includes('application/json')) {
            data = await response.json();
        } else {
            var text = await response.text();
            console.error('Token response not JSON:', text.slice(0, 200));
            return res.status(502).json({ error: 'Adobe IMS returned an unexpected response.' });
        }

        if (!response.ok) {
            console.error('Token error:', data);
            return res.status(response.status).json({
                error: data.error_description || data.error || 'Failed to get Access Token'
            });
        }

        res.json({ accessToken: data.access_token, expiresIn: data.expires_in });
    } catch (error) {
        console.error('Auth error:', error);
        if (error.name === 'AbortError') {
            return res.status(504).json({ error: 'Request to Adobe IMS timed out.' });
        }
        return res.status(500).json({ error: error.message || 'Failed to get Access Token' });
    }
});

module.exports = router;
