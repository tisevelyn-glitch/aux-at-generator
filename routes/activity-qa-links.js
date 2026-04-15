/**
 * Activity QA 링크 저장/조회 (파일 기반)
 */
const express = require('express');
const router = express.Router();
const { config } = require('../lib/adobe');
const { getQaLinks, upsertQaLinks } = require('../lib/activity-qa-links-store');

router.get('/:id', function (req, res) {
  try {
    const activityId = String(req.params.id || '').trim();
    if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
    if (!config.tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
    const hit = getQaLinks(config.tenant, config.clientId, activityId);
    res.json({ ok: true, found: !!hit, data: hit || { items: [], updatedAt: null } });
  } catch (e) {
    console.error('[activity-qa-links GET]', e);
    res.status(500).json({ ok: false, error: e.message || 'Server error' });
  }
});

router.put('/:id', function (req, res) {
  try {
    const activityId = String(req.params.id || '').trim();
    if (!activityId) return res.status(400).json({ error: 'Activity ID is required.' });
    if (!config.tenant || !config.clientId) return res.status(400).json({ error: 'ADOBE_TENANT and ADOBE_CLIENT_ID are required in .env.' });
    const items = req.body && req.body.items;
    const r = upsertQaLinks(config.tenant, config.clientId, activityId, items);
    if (!r.ok) return res.status(400).json({ ok: false, error: r.error || 'Invalid payload' });
    res.json({ ok: true, data: { items: r.items || [] } });
  } catch (e) {
    console.error('[activity-qa-links PUT]', e);
    res.status(500).json({ ok: false, error: e.message || 'Server error' });
  }
});

module.exports = router;

