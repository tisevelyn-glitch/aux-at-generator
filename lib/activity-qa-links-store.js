/**
 * Activity QA 링크 저장소 (파일 기반)
 * - tenant + clientId + activityId 단위로 저장
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'activity-qa-links.json');

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

function readAll() {
  ensureDir();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    return [];
  }
}

function writeAll(entries) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify({ entries }, null, 2), 'utf8');
}

function keyOf(tenant, clientId, activityId) {
  return `${tenant}::${clientId}::${String(activityId)}`;
}

function normalizeLinkItem(it) {
  it = it || {};
  const name = (it.name != null ? String(it.name) : '').trim() || 'QA';
  let query = (it.query != null ? String(it.query) : (it.url != null ? String(it.url) : '')).trim();
  if (!query) return null;
  // allow full url or querystring
  if (!/^https?:\/\//i.test(query)) {
    query = query.replace(/^\?/, '');
    // store as query without leading '?'
  }
  return { name, query };
}

function upsertQaLinks(tenant, clientId, activityId, items) {
  if (!tenant || !clientId || activityId == null) return { ok: false, error: 'missing key fields' };
  if (!Array.isArray(items)) items = [];
  const normalized = items.map(normalizeLinkItem).filter(Boolean);
  const entries = readAll();
  const k = keyOf(tenant, clientId, activityId);
  const now = new Date().toISOString();
  let found = false;
  const next = entries.map(e => {
    const ek = keyOf(e.tenant, e.clientId, e.activityId);
    if (ek !== k) return e;
    found = true;
    return Object.assign({}, e, {
      tenant,
      clientId,
      activityId: String(activityId),
      items: normalized,
      updatedAt: now,
    });
  });
  if (!found) {
    next.push({
      tenant,
      clientId,
      activityId: String(activityId),
      items: normalized,
      updatedAt: now,
      createdAt: now,
    });
  }
  writeAll(next);
  return { ok: true, items: normalized };
}

function getQaLinks(tenant, clientId, activityId) {
  if (!tenant || !clientId || activityId == null) return null;
  const entries = readAll();
  const k = keyOf(tenant, clientId, activityId);
  const hit = entries.find(e => keyOf(e.tenant, e.clientId, e.activityId) === k);
  if (!hit) return null;
  return { items: Array.isArray(hit.items) ? hit.items : [], updatedAt: hit.updatedAt || null };
}

module.exports = { getQaLinks, upsertQaLinks };

