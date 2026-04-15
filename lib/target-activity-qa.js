/**
 * Adobe Target Admin API activity GET 본문에서 Experience별 Activity QA 쿼리 후보를 추출합니다.
 * 필드명은 제품 버전·테넌트에 따라 다를 수 있어 여러 패턴을 시도합니다.
 */
const fetch = require('node-fetch');

function enc(s) {
  return encodeURIComponent(String(s));
}

/**
 * @param {object|null} activity
 * @returns {{ experiences: Array<{ experienceLocalId: *, name: string, qaQueryString: string|null, source: string, rawPreviewFields?: object }>, note: string|null }}
 */
function extractQaPreviewFromActivity(activity) {
  if (!activity || typeof activity !== 'object') {
    return { experiences: [], note: null };
  }

  var rootToken = activity.at_preview_token || activity.previewToken;
  var exps = Array.isArray(activity.experiences) ? activity.experiences : [];
  var rows = [];
  var i;
  var ex;
  var lid;
  var nm;
  var qs;
  var source;
  var token;
  var idx;
  var parts;
  var lo;
  var aud;
  var hints;
  var k;

  for (i = 0; i < exps.length; i++) {
    ex = exps[i];
    if (!ex || typeof ex !== 'object') continue;
    lid = ex.experienceLocalId != null ? ex.experienceLocalId : ex.localId;
    nm = ex.name != null ? String(ex.name) : '';
    qs = '';
    source = 'none';

    if (typeof ex.qaUrl === 'string' && ex.qaUrl.trim()) {
      qs = ex.qaUrl.replace(/^\?/, '').trim();
      source = 'qaUrl';
    } else if (typeof ex.activityQaUrl === 'string' && ex.activityQaUrl.trim()) {
      qs = ex.activityQaUrl.replace(/^\?/, '').trim();
      source = 'activityQaUrl';
    } else {
      token = ex.at_preview_token || ex.previewToken || rootToken;
      idx = ex.at_preview_index != null ? ex.at_preview_index : ex.previewIndex;
      parts = [];
      if (token) parts.push('at_preview_token=' + enc(token));
      if (idx != null && idx !== '') parts.push('at_preview_index=' + enc(String(idx)));
      lo = ex.at_preview_listed_activities_only;
      if (lo === true || lo === 'true' || lo === 1) parts.push('at_preview_listed_activities_only=true');
      aud = ex.at_preview_evaluate_as_true_audience_ids;
      if (aud != null && String(aud) !== '') {
        parts.push('at_preview_evaluate_as_true_audience_ids=' + enc(String(aud)));
      }
      if (parts.length) {
        qs = parts.join('&');
        source = 'composed';
      }
    }

    if (qs) {
      rows.push({ experienceLocalId: lid, name: nm, qaQueryString: qs, source: source });
    } else {
      hints = null;
      for (k in ex) {
        if (Object.prototype.hasOwnProperty.call(ex, k) && /preview|qa/i.test(k)) {
          if (!hints) hints = {};
          hints[k] = ex[k];
        }
      }
      if (hints && Object.keys(hints).length) {
        rows.push({
          experienceLocalId: lid,
          name: nm,
          qaQueryString: null,
          source: 'hints',
          rawPreviewFields: hints
        });
      }
    }
  }

  var note = null;
  if (rows.length === 0 && exps.length > 0) {
    note = 'No known QA preview fields on this activity response. Use Target UI → Activity QA to copy links.';
  }
  if (rows.length === 0 && exps.length === 0) {
    note = 'No experiences on activity; QA params unavailable.';
  }
  return { experiences: rows, note: note };
}

/**
 * 생성 직후 GET으로 최신 본문을 가져와 qaPreview만 반환 (실패 시 빈 객체).
 */
async function fetchActivityQaPreview(tenant, accessToken, clientId, activityId, typePath) {
  var id = String(activityId || '').trim();
  if (!tenant || !accessToken || !clientId || !id) {
    return { experiences: [], note: null };
  }
  var path = typePath === 'xt' ? 'xt' : 'ab';
  var url = 'https://mc.adobe.io/' + tenant + '/target/activities/' + path + '/' + encodeURIComponent(id);
  try {
    var r = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'X-Api-Key': clientId,
        Accept: 'application/vnd.adobe.target.v3+json'
      }
    });
    var text = await r.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
    if (!r.ok || !data) {
      return { experiences: [], note: 'Could not load activity for QA preview.' };
    }
    return extractQaPreviewFromActivity(data);
  } catch (e) {
    return { experiences: [], note: e.message || 'QA preview fetch failed.' };
  }
}

module.exports = { extractQaPreviewFromActivity, fetchActivityQaPreview };
