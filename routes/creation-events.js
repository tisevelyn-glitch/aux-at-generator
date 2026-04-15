/**
 * creation_events 조회 (로그인 세션 + tenant/client 스코프)
 */
const express = require('express');
const router = express.Router();
const { config } = require('../lib/adobe');
const { listCreationEvents } = require('../lib/creation-events');

router.get('/', async function (req, res) {
  try {
    var rt = String(req.query.resourceType || '').trim().toLowerCase();
    var rid = String(req.query.resourceId || '').trim();
    if ((rt !== 'offer' && rt !== 'activity') || !rid) {
      return res.status(400).json({
        ok: false,
        error: 'Query parameters resourceType (offer|activity) and resourceId are required.',
        events: [],
        db: false
      });
    }
    var limit = parseInt(String(req.query.limit || '50'), 10);
    var result = await listCreationEvents({
      tenant: config.tenant,
      clientId: config.clientId,
      resourceType: rt,
      resourceId: rid,
      limit: limit
    });
    res.json(Object.assign({ ok: true }, result));
  } catch (e) {
    console.error('[creation-events GET]', e);
    res.status(500).json({ ok: false, error: e.message || 'Server error', events: [], db: false });
  }
});

module.exports = router;
