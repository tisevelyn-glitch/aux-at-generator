#!/usr/bin/env node
/**
 * Adobe Target API - Workspace별 Activity 생성 테스트
 * 사용법:
 *   node test-workspace-api.js              → 모든 workspace 테스트
 *   node test-workspace-api.js SEUK         → SEUK workspace만 테스트 (sample)
 *   node test-workspace-api.js SEUK 2101999 → SEUK + 해당 workspace에 이미 있는 Offer ID 사용 (Target UI에서 SEUK에 만든 Offer)
 *   node test-workspace-api.js 223093514    → workspace ID로 지정
 * "Offer not accessible in provided workspaces" 나오면: 해당 workspace에 Offer가 없는 것. Target UI에서 그 workspace에 Offer 하나 만든 뒤 ID를 인자로 넘기면 됨.
 */
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// JSON 디버그 저장 (기본 ON). 끄려면 DEBUG_JSON=0
const DEBUG_JSON_ENABLED = String(process.env.DEBUG_JSON || '1') !== '0';
const DEBUG_JSON_DIR = path.join(__dirname, 'json');

function isoStamp() {
  // 파일명 안전하게 ':' '.' 제거
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function redactHeaders(headers) {
  const out = { ...(headers || {}) };
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === 'authorization') out[k] = 'Bearer ***';
  }
  return out;
}

function writeDebugJson(prefix, workspaceIdStr, obj) {
  if (!DEBUG_JSON_ENABLED) return;
  try {
    fs.mkdirSync(DEBUG_JSON_DIR, { recursive: true });
    const filename = `${isoStamp()}_${prefix}_ws-${workspaceIdStr}.json`;
    fs.writeFileSync(path.join(DEBUG_JSON_DIR, filename), JSON.stringify(obj, null, 2), 'utf8');
  } catch {
    // 디버그 저장 실패는 테스트 실패로 간주하지 않음
  }
}

const ALL_WORKSPACES = [
  { name: 'Default', id: '222991964' },
  { name: '/SEBN', id: '223101869' },
  { name: '/SEF', id: '259214924' },
  { name: '/SEG', id: '223101884' },
  { name: '/SEIB-ES', id: '808870526' },
  { name: '/SEIB-PT', id: '812325246' },
  { name: '/SEUK', id: '223093514' },
];

function resolveWorkspaces(arg) {
  if (!arg || !String(arg).trim()) return ALL_WORKSPACES;
  const key = String(arg).trim().toUpperCase();
  const byId = ALL_WORKSPACES.find(w => String(w.id) === String(arg));
  if (byId) return [byId];
  const byName = ALL_WORKSPACES.filter(
    w => w.name.toUpperCase().replace(/\//g, '') === key || w.name.toUpperCase().includes(key)
  );
  if (byName.length) return byName;
  console.error(`❌ 알 수 없는 workspace: ${arg}. 사용 가능: Default, SEUK, SEBN, SEF, SEG, SEIB-ES, SEIB-PT 또는 workspace ID`);
  process.exit(1);
}

const config = {
  clientId: process.env.ADOBE_CLIENT_ID,
  clientSecret: process.env.ADOBE_CLIENT_SECRET,
  tenant: process.env.ADOBE_TENANT,
};

async function getToken() {
  if (process.env.ADOBE_ACCESS_TOKEN && process.env.ADOBE_ACCESS_TOKEN.trim()) {
    return process.env.ADOBE_ACCESS_TOKEN.trim();
  }
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

async function getActivitiesByWorkspace(accessToken, workspaceId) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/activities?workspace=${encodeURIComponent(workspaceIdStr)}&limit=50`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'Accept': 'application/vnd.adobe.target.v3+json',
  };
  writeDebugJson('activities_list_request', workspaceIdStr, {
    method: 'GET',
    url,
    headers: redactHeaders(headers),
  });
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  writeDebugJson('activities_list_response', workspaceIdStr, {
    status: res.status,
    ok: res.ok,
    body: data,
  });
  return res.ok ? (data.activities || []) : [];
}

const DEFAULT_WORKSPACE_ID = '222991964';

/** non-default workspace용 property ID 목록 (.env ADOBE_PROPERTY_IDS=123,456) */
function getPropertyIds() {
  const raw = process.env.ADOBE_PROPERTY_IDS || '';
  if (!raw.trim()) return [];
  return raw.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

/**
 * Offer 단건 조회 (지정 workspace 기준). 응답에 workspace 포함.
 */
async function getOfferById(accessToken, offerId, workspaceId) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Accept': 'application/vnd.adobe.target.v2+json',
  };
  writeDebugJson('offer_get_request', workspaceIdStr, {
    method: 'GET',
    url,
    headers: redactHeaders(headers),
  });
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  writeDebugJson('offer_get_response', workspaceIdStr, {
    status: res.status,
    ok: res.ok,
    body: data ?? { raw: text },
  });
  return res.ok ? data : null;
}

/**
 * 해당 workspace에 HTML Offer 1개 생성 후 offerId 반환.
 * workspace 지정: X-Admin-Workspace-Id 헤더 + URL query ?workspace= + body.workspace (v2 문서상 Offer는 body workspace 지원)
 */
async function createOfferInWorkspace(accessToken, workspaceId) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const payload = {
    name: `API_Test_Offer_${workspaceIdStr}_${Date.now()}`,
    content: '<div>Test content</div>',
    workspace: workspaceIdStr,
  };
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Content-Type': 'application/vnd.adobe.target.v2+json',
    'Accept': 'application/vnd.adobe.target.v2+json',
  };
  writeDebugJson('offer_create_request', workspaceIdStr, {
    method: 'POST',
    url,
    headers: redactHeaders(headers),
    body: payload,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  writeDebugJson('offer_create_response', workspaceIdStr, {
    status: res.status,
    ok: res.ok,
    body: data,
  });
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.message || data?.raw || `Offer create failed ${res.status}`);
  return data.id;
}

/**
 * createActivity_2 스펙 기준 (https://developer.adobe.com/target/administer/admin-api/#tag/Activities/operation/createActivity_2)
 * - locations: mboxes 배열 (locationLocalId, name)
 * - options: 루트 레벨 옵션 배열 (optionLocalId, offerId)
 * - experiences: experienceLocalId, name, visitorPercentage, optionLocations (locationLocalId, optionLocalId)
 * - metrics: metricLocalId, name, conversion, mboxes, action
 */
async function testActivityCreate(accessToken, workspaceId, offerId) {
  const workspaceIdStr = String(workspaceId);
  const url = `https://mc.adobe.io/${config.tenant}/target/activities/ab?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const offerIdNum = Number(offerId) || offerId;

  const propertyIds = getPropertyIds();
  const isNonDefault = workspaceIdStr !== DEFAULT_WORKSPACE_ID;
  if (isNonDefault && propertyIds.length === 0) {
    throw new Error('non-default workspace에는 propertyIds가 필요합니다. .env에 ADOBE_PROPERTY_IDS=속성ID (숫자) 추가하세요. Target UI > 관리 > 속성에서 SEUK에 할당된 속성 ID 확인');
  }

  const payload = {
    name: `API_Test_Activity_${Date.now()}`,
    state: 'saved',
    priority: 5,
    workspace: workspaceIdStr,
    ...(propertyIds.length > 0 ? { propertyIds } : {}),
    locations: {
      mboxes: [
        { locationLocalId: 0, name: 'default' },
      ],
    },
    options: [
      { optionLocalId: 0, offerId: offerIdNum },
    ],
    experiences: [
      {
        experienceLocalId: 0,
        name: 'Control',
        visitorPercentage: 50,
        optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }],
      },
      {
        experienceLocalId: 1,
        name: 'Var1',
        visitorPercentage: 50,
        optionLocations: [{ locationLocalId: 0, optionLocalId: 0 }],
      },
    ],
    metrics: [
      {
        metricLocalId: 32767,
        name: 'Page Views',
        conversion: true,
        mboxes: [{ name: 'default', successEvent: 'mbox_shown' }],
        action: { type: 'count_once' },
      },
    ],
  };

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Content-Type': 'application/vnd.adobe.target.v3+json',
    'Accept': 'application/vnd.adobe.target.v3+json',
  };
  writeDebugJson('activity_create_request', workspaceIdStr, {
    method: 'POST',
    url,
    headers: redactHeaders(headers),
    body: payload,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  writeDebugJson('activity_create_response', workspaceIdStr, {
    status: res.status,
    ok: res.ok,
    body: data,
  });
  return { ok: res.ok, status: res.status, data };
}

/** 생성된 Activity를 GET해서 실제로 저장된 workspace 확인 (진단용) */
async function getActivityById(accessToken, activityId) {
  const url = `https://mc.adobe.io/${config.tenant}/target/activities/ab/${activityId}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'Accept': 'application/vnd.adobe.target.v3+json',
  };
  writeDebugJson('activity_get_request', 'na', {
    method: 'GET',
    url,
    headers: redactHeaders(headers),
  });
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  writeDebugJson('activity_get_response', 'na', {
    status: res.status,
    ok: res.ok,
    body: data ?? { raw: text },
  });
  return res.ok ? data : null;
}

async function main() {
  const useEnvToken = !!(process.env.ADOBE_ACCESS_TOKEN && process.env.ADOBE_ACCESS_TOKEN.trim());
  if (!useEnvToken && (!config.clientId || !config.clientSecret || !config.tenant)) {
    console.error('❌ .env에 ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_TENANT 필요 (또는 ADOBE_ACCESS_TOKEN만 설정)');
    process.exit(1);
  }
  if (!config.tenant) {
    console.error('❌ ADOBE_TENANT 필요');
    process.exit(1);
  }

  const WORKSPACES = resolveWorkspaces(process.argv[2]);
  const existingOfferId = process.argv[3] || process.env.TEST_OFFER_ID; // 해당 workspace에 이미 있는 Offer ID (Target UI에서 생성)
  const singleWorkspace = WORKSPACES.length === 1;

  if (useEnvToken) console.log('🔑 .env의 ADOBE_ACCESS_TOKEN 사용');
  else console.log('🔑 Token 발급 중...');
  const token = await getToken();
  console.log('✓ Token 준비 완료\n');
  if (singleWorkspace) {
    console.log(`📌 테스트 대상: ${WORKSPACES[0].name} (${WORKSPACES[0].id}) — 1개 workspace만 실행\n`);
  } else {
    console.log('📌 원인: Activity는 "해당 workspace에 있는 Offer"를 참조해야 같은 workspace에 생성됩니다.');
    console.log('   → 각 workspace마다 Offer를 먼저 생성한 뒤, 그 offerId로 Activity 생성합니다.\n');
  }

  console.log('=== Workspace별 Offer 생성 → Activity 생성 테스트 ===\n');
  const results = {};

  const created = [];
  for (const ws of WORKSPACES) {
    let offerIdToUse;
    if (existingOfferId && singleWorkspace) {
      offerIdToUse = existingOfferId;
      console.log(`  ${ws.name} (${ws.id}) - 기존 Offer ID 사용: ${offerIdToUse} (해당 workspace에 있어야 함)`);
    } else {
      process.stdout.write(`  ${ws.name} (${ws.id}) - Offer 생성... `);
      try {
        offerIdToUse = await createOfferInWorkspace(token, ws.id);
        const offerInRequestedWs = await getOfferById(token, offerIdToUse, ws.id);
        const offerInDefault = await getOfferById(token, offerIdToUse, DEFAULT_WORKSPACE_ID);
        const actuallyInWs = offerInRequestedWs && (String(offerInRequestedWs.workspace) === String(ws.id));
        if (actuallyInWs) {
          console.log(`Offer ID ${offerIdToUse} (해당 workspace에 생성됨)`);
        } else if (offerInDefault) {
          console.log(`Offer ID ${offerIdToUse} → 실제로 Default workspace에 생성됨 (API가 workspace 파라미터 무시)`);
        } else {
          console.log(`Offer ID ${offerIdToUse}`);
        }
      } catch (e) {
        console.log(`✗ Offer 실패: ${e.message}`);
        results[ws.id] = { ok: false, data: { error: e.message } };
        continue;
      }
    }
    process.stdout.write(`           - Activity 생성... `);
    const actRes = await testActivityCreate(token, ws.id, offerIdToUse);
    results[ws.id] = actRes;
    if (actRes.ok) {
      const activityId = actRes.data.id;
      created.push({ ws, activityId });
      const actual = await getActivityById(token, activityId);
      const actualWs = actual?.workspace ? String(actual.workspace) : '(응답에 없음)';
      const wantedWs = String(ws.id);
      const ok = actualWs === wantedWs;
      if (ok) {
        console.log(`✓ 성공 (Activity ID: ${activityId}, workspace: ${actualWs})`);
      } else {
        console.log(`✓ API성공 (Activity ID: ${activityId}) → 실제 저장 위치: ${actualWs} (요청: ${wantedWs})`);
      }
    } else {
      const err = actRes.data?.errors?.[0]?.message || actRes.data?.message || actRes.data?.error || actRes.data?.raw || 'Unknown';
      console.log(`✗ 실패: ${err}`);
    }
  }

  console.log('\n=== Workspace별 검증 (생성된 Activity가 해당 workspace에 있는지) ===\n');
  let verified = 0;
  for (const { ws, activityId } of created) {
    process.stdout.write(`  ${ws.name} (${ws.id}) - Activity ${activityId} 확인... `);
    const activities = await getActivitiesByWorkspace(token, ws.id);
    const found = activities.find(a => String(a.id) === String(activityId));
    if (found) {
      console.log(`✓ 해당 workspace에 존재`);
      verified++;
    } else {
      const actual = await getActivityById(token, activityId);
      const actualWs = actual?.workspace ? String(actual.workspace) : '?';
      console.log(`✗ 해당 workspace에 없음 → 실제 위치: workspace ${actualWs}`);
    }
  }

  console.log('\n=== 테스트 요약 ===');
  const actOk = Object.values(results).filter(r => r.ok).length;
  console.log(`Activity 생성: ${actOk}/${WORKSPACES.length} 성공`);
  console.log(`Workspace 검증: ${verified}/${created.length} 올바른 위치`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
