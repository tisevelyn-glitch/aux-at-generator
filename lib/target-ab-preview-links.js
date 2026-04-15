/**
 * Adobe Target Admin API — AB/XT Activity: Create preview links
 * POST https://mc.adobe.io/{tenant}/target/activities/{ab|xt}/{id}/preview
 * Body: { "url": "<test page URL>" }  (Adobe 문서/콘솔에서 통용되는 page URL 필드)
 */
const fetch = require('node-fetch');

function mergeTestUrlWithQuery(testUrl, queryOrUrl) {
  var baseStr = String(testUrl || '').trim();
  if (!baseStr) return null;
  var raw = String(queryOrUrl || '').trim();
  if (!raw) return baseStr;
  if (/^https?:\/\//i.test(raw)) return raw;
  var u;
  try {
    u = new URL(baseStr);
  } catch (e) {
    return null;
  }
  var q = raw.replace(/^\?/, '');
  var add = new URLSearchParams(q);
  add.forEach(function (val, key) {
    u.searchParams.set(key, val);
  });
  return u.toString();
}

function collectPreviewLikeStrings(val, out) {
  if (val == null) return;
  if (typeof val === 'string') {
    if (val.indexOf('at_preview_token') !== -1 || val.indexOf('at_qa_mode') !== -1) {
      out.push(val);
    }
    return;
  }
  if (Array.isArray(val)) {
    val.forEach(function (item) {
      collectPreviewLikeStrings(item, out);
    });
    return;
  }
  if (typeof val === 'object') {
    Object.keys(val).forEach(function (k) {
      collectPreviewLikeStrings(val[k], out);
    });
  }
}

/**
 * @param {string} accessToken
 * @param {string} workspaceId
 * @param {string|number} activityId
 * @param {string} testUrl — QA 시 테스트할 페이지 URL (쿼리가 붙을 베이스)
 * @param {string} tenant
 * @param {string} clientId
 * @param {object} [opts]
 * @param {'ab'|'xt'} [opts.activityType]
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, links?: Array<{ name: string, url: string }>, activityName?: string|null, data?: object }>}
 */
async function getQALink(accessToken, workspaceId, activityId, testUrl, tenant, clientId, opts) {
  opts = opts || {};
  var ws = String(workspaceId || '').trim();
  var id = String(activityId != null ? activityId : '').trim();
  var t = String(tenant || '').trim();
  var cid = String(clientId || '').trim();
  var pageUrl = String(testUrl || '').trim();
  if (!pageUrl) {
    return { ok: false, error: 'testUrl is required' };
  }
  if (!ws || !id || !t || !cid) {
    return { ok: false, error: 'workspaceId, activityId, tenant, and clientId are required' };
  }
  var typePath = (opts.activityType || 'ab').toLowerCase() === 'xt' ? 'xt' : 'ab';
  var url =
    'https://mc.adobe.io/' +
    encodeURIComponent(t) +
    '/target/activities/' +
    typePath +
    '/' +
    encodeURIComponent(id) +
    '/preview';
  var res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'X-Api-Key': cid,
      'X-Admin-Workspace-Id': ws,
      'Content-Type': 'application/vnd.adobe.target.v3+json',
      Accept: 'application/vnd.adobe.target.v3+json'
    },
    body: JSON.stringify({ url: pageUrl })
  });
  var text = await res.text();
  // Some tenants/environments return a blank 404 for preview endpoints (feature not available).
  // In that case, we return ok:true with an explanatory note so the UI doesn't look "broken".
  if (res.status === 404 && (!text || !String(text).trim())) {
    return {
      ok: true,
      links: [],
      activityName: null,
      data: null,
      note:
        'Adobe Preview Links endpoint returned 404 (empty body). This usually means the feature is not available in this tenant/region/API gateway. Use Target UI → Activity QA to generate links.'
    };
  }
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok) {
    var err =
      (data && (data.message || data.error || (data.errors && data.errors[0] && data.errors[0].message))) ||
      text ||
      'Preview API failed';
    return { ok: false, status: res.status, error: String(err), data: data };
  }

  var activityName = data && data.name != null ? String(data.name) : null;
  var seen = new Set();
  var links = [];

  var experiences = Array.isArray(data.experiences) ? data.experiences : [];
  var i;
  var ex;
  var nm;
  var cand;
  var abs;
  for (i = 0; i < experiences.length; i++) {
    ex = experiences[i];
    if (!ex || typeof ex !== 'object') continue;
    nm =
      ex.name != null
        ? String(ex.name)
        : 'Experience ' + (ex.experienceLocalId != null ? ex.experienceLocalId : i);
    cand = ex.url || ex.previewUrl || ex.qaUrl || ex.activityQaUrl || null;
    if (cand) {
      abs = mergeTestUrlWithQuery(pageUrl, cand);
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        links.push({ name: nm, url: abs });
      }
    }
  }

  var loose = [];
  collectPreviewLikeStrings(data, loose);
  for (i = 0; i < loose.length; i++) {
    abs = mergeTestUrlWithQuery(pageUrl, loose[i]);
    if (abs && !seen.has(abs)) {
      seen.add(abs);
      links.push({ name: 'QA', url: abs });
    }
  }

  var note = null;
  if (links.length === 0) {
    note =
      'Preview API succeeded but no URL containing at_preview_token was found in the JSON. Check the raw response in debug logs or Target UI → Activity QA.';
  }
  return { ok: true, links: links, activityName: activityName, data: data, note: note };
}

module.exports = { getQALink, mergeTestUrlWithQuery };
