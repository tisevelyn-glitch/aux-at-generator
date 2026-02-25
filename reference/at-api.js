/**
 * Adobe Target Admin API - 웹 서버용 (디버그 파일 저장 없음)
 */
const fetch = require('node-fetch');

const config = {
  clientId: process.env.ADOBE_CLIENT_ID,
  clientSecret: process.env.ADOBE_CLIENT_SECRET,
  tenant: process.env.ADOBE_TENANT,
};

const DEFAULT_WORKSPACE_ID = '222991964';

const ALL_WORKSPACES = [
  { name: 'Default', id: '222991964' },
  { name: '/SEBN', id: '223101869' },
  { name: '/SEF', id: '259214924' },
  { name: '/SEG', id: '223101884' },
  { name: '/SEIB-ES', id: '808870526' },
  { name: '/SEIB-PT', id: '812325246' },
  { name: '/SEUK', id: '223093514' },
];

/** 워크스페이스별 Property ID. env: ADOBE_PROPERTY_IDS_<workspaceId> 또는 ADOBE_PROPERTY_IDS (공통) */
function getPropertyIds(workspaceId) {
  if (workspaceId) {
    const key = 'ADOBE_PROPERTY_IDS_' + String(workspaceId);
    const raw = process.env[key] || process.env.ADOBE_PROPERTY_IDS || '';
    if (!raw.trim()) return [];
    return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }
  const raw = process.env.ADOBE_PROPERTY_IDS || '';
  if (!raw.trim()) return [];
  return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

/** API 응답용: 워크스페이스 목록에 각 w/s별 propertyIds 포함 */
function getWorkspacesWithPropertyIds() {
  return ALL_WORKSPACES.map(w => ({
    ...w,
    propertyIds: getPropertyIds(w.id),
  }));
}

async function getToken() {
  // Client ID/Secret이 있으면 항상 새 토큰 발급 (만료된 .env 토큰 방지)
  if (config.clientId && config.clientSecret) {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('scope', 'openid,AdobeID,target_sdk,read_organizations,additional_info.projectedProductContext');
    const res = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || 'Token failed');
    return data.access_token;
  }
  if (process.env.ADOBE_ACCESS_TOKEN && process.env.ADOBE_ACCESS_TOKEN.trim()) {
    return process.env.ADOBE_ACCESS_TOKEN.trim();
  }
  throw new Error('ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET 또는 ADOBE_ACCESS_TOKEN이 필요합니다.');
}

async function getOfferById(accessToken, offerId, workspaceId) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Accept': 'application/vnd.adobe.target.v2+json',
  };
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) return null;
  return data;
}

async function createOfferInWorkspace(accessToken, workspaceId, offerName, content) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const htmlContent = (content && String(content).trim()) ? String(content).trim() : '<div>Test content</div>';
  const payload = {
    name: offerName || `API_Test_Offer_${workspaceIdStr}_${Date.now()}`,
    content: htmlContent,
    workspace: workspaceIdStr,
  };
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Content-Type': 'application/vnd.adobe.target.v2+json',
    'Accept': 'application/vnd.adobe.target.v2+json',
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.message || data?.raw || `Offer create failed ${res.status}`);
  return data.id;
}

function parsePropertyIds(value) {
  if (Array.isArray(value) && value.length) {
    return value.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }
  return [];
}

async function createActivity(accessToken, workspaceId, offerId, opts = {}) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/activities/ab?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const offerIdNum = Number(offerId) || offerId;
  const fromOpts = parsePropertyIds(opts.propertyIds);
  const propertyIds = fromOpts.length ? fromOpts : getPropertyIds(workspaceIdStr);
  const isNonDefault = workspaceIdStr !== DEFAULT_WORKSPACE_ID;
  if (isNonDefault && propertyIds.length === 0) {
    throw new Error('non-default workspace에는 Property ID가 필요합니다. 아래 "Property IDs"에 입력하거나 .env에 ADOBE_PROPERTY_IDS를 추가하세요. (확인 방법: docs-PROPERTY_ID.md)');
  }
  const mboxName = (opts.mboxName && String(opts.mboxName).trim()) || 'default';
  const controlName = (opts.controlName && String(opts.controlName).trim()) || 'Control';
  const variationName = (opts.variationName && String(opts.variationName).trim()) || 'Var1';
  const pctControl = Math.min(100, Math.max(0, Number(opts.visitorPctControl) || 50));
  const pctVariation = Math.min(100, Math.max(0, Number(opts.visitorPctVariation) || 50));
  const priority = Math.min(100, Math.max(0, Number(opts.priority) || 5));
  const state = (opts.state && String(opts.state).trim()) || 'saved';
  const payload = {
    name: (opts.activityName && String(opts.activityName).trim()) || `API_Test_Activity_${Date.now()}`,
    state,
    priority,
    workspace: workspaceIdStr,
    ...(propertyIds.length > 0 ? { propertyIds } : {}),
    locations: { mboxes: [{ locationLocalId: 0, name: mboxName }] },
    options: [{ optionLocalId: 0, offerId: offerIdNum }],
    experiences: [
      { experienceLocalId: 0, name: controlName, visitorPercentage: pctControl, optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] },
      { experienceLocalId: 1, name: variationName, visitorPercentage: pctVariation, optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }] },
    ],
    metrics: [
      { metricLocalId: 32767, name: 'Page Views', conversion: true, mboxes: [{ name: mboxName, successEvent: 'mbox_shown' }], action: { type: 'count_once' } },
    ],
  };
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Content-Type': 'application/vnd.adobe.target.v3+json',
    'Accept': 'application/vnd.adobe.target.v3+json',
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

module.exports = {
  ALL_WORKSPACES,
  getWorkspacesWithPropertyIds,
  getToken,
  getOfferById,
  createOfferInWorkspace,
  createActivity,
  config,
};
