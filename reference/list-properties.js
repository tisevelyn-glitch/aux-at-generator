#!/usr/bin/env node
/**
 * Adobe Target Admin API - Properties(속성) 목록 조회 (workspace별)
 *
 * 사용법:
 *   node list-properties.js              → 전체 workspace 순회 조회
 *   node list-properties.js SEUK         → 특정 workspace만 조회
 *   node list-properties.js 223093514    → workspace ID로 조회
 *
 * 참고:
 * - non-default workspace Activity 생성 시 필요한 propertyIds 확인용
 * - 응답 구조는 테넌트/버전에 따라 다를 수 있어 방어적으로 파싱함
 */
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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

const DEBUG_DIR = path.join(__dirname, 'json');

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function redactHeaders(headers) {
  const out = { ...(headers || {}) };
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === 'authorization') out[k] = 'Bearer ***';
  }
  return out;
}

function writeJson(filename, obj) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEBUG_DIR, filename), JSON.stringify(obj, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

async function getToken() {
  if (process.env.ADOBE_ACCESS_TOKEN && process.env.ADOBE_ACCESS_TOKEN.trim()) {
    return process.env.ADOBE_ACCESS_TOKEN.trim();
  }
  if (!config.clientId || !config.clientSecret) throw new Error('ADOBE_CLIENT_ID/ADOBE_CLIENT_SECRET 누락');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', config.clientId);
  params.append('client_secret', config.clientSecret);
  // roles 포함 (권한 컨텍스트 확인용)
  params.append('scope', 'openid,AdobeID,target_sdk,read_organizations,additional_info.projectedProductContext,additional_info.roles');

  const res = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token failed');
  return data.access_token;
}

function normalizeProperties(data) {
  if (!data) return [];
  if (Array.isArray(data.properties)) return data.properties;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

function pickPropFields(p) {
  const id = p.id ?? p.propertyId ?? p.propertyID ?? null;
  const name = p.name ?? p.propertyName ?? null;
  const apiToken = p.apiToken ?? p.token ?? p.at_property ?? p.atProperty ?? null;
  const workspace = p.workspace ?? p.workspaceId ?? null;
  return { id, name, apiToken, workspace };
}

async function getPropertyList(accessToken, workspaceId) {
  const workspaceIdStr = String(workspaceId);
  // 일부 테넌트는 query를 무시할 수 있어 헤더/쿼리 둘 다 시도
  const url = `https://mc.adobe.io/${config.tenant}/target/properties?workspace=${encodeURIComponent(workspaceIdStr)}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key': config.clientId,
    'X-Admin-Workspace-Id': workspaceIdStr,
    'Accept': 'application/vnd.adobe.target.v3+json',
  };

  writeJson(`${isoStamp()}_properties_list_request_ws-${workspaceIdStr}.json`, {
    method: 'GET',
    url,
    headers: redactHeaders(headers),
  });

  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  writeJson(`${isoStamp()}_properties_list_response_ws-${workspaceIdStr}.json`, {
    status: res.status,
    ok: res.ok,
    body: data,
  });

  if (!res.ok) {
    const msg = data?.errors?.[0]?.message || data?.message || data?.raw || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return normalizeProperties(data).map(pickPropFields);
}

async function main() {
  if (!config.tenant) {
    console.error('❌ ADOBE_TENANT 필요');
    process.exit(1);
  }
  if (!config.clientId) {
    console.error('❌ ADOBE_CLIENT_ID 필요 (X-Api-Key용)');
    process.exit(1);
  }

  const workspaces = resolveWorkspaces(process.argv[2]);
  const token = await getToken();

  for (const ws of workspaces) {
    console.log(`\n=== Properties @ ${ws.name} (${ws.id}) ===`);
    try {
      const props = await getPropertyList(token, ws.id);
      if (!props.length) {
        console.log('(결과 없음)');
        continue;
      }
      for (const p of props) {
        console.log(`- name: ${p.name ?? '(no-name)'} | id: ${p.id ?? '(no-id)'} | apiToken: ${p.apiToken ?? '(no-token)'} | workspace: ${p.workspace ?? '(no-ws)'}`);
      }
    } catch (e) {
      console.log(`(조회 실패) ${e.message}`);
    }
  }

  console.log(`\n(원본 request/response는 ${path.relative(process.cwd(), DEBUG_DIR)}/ 폴더에 저장됨)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

