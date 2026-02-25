#!/usr/bin/env node
/**
 * API_Test로 시작하는 모든 Activity 검색 → 상세 조회 → 확인 후 삭제
 * 사용법: node delete-api-test-activities.js           (검색/조회만)
 *        node delete-api-test-activities.js --delete  (삭제 실행)
 */
require('dotenv').config();
const fetch = require('node-fetch');

const WORKSPACES = [
  { name: 'Default', id: '222991964' },
  { name: '/SEBN', id: '223101869' },
  { name: '/SEF', id: '259214924' },
  { name: '/SEG', id: '223101884' },
  { name: '/SEIB-ES', id: '808870526' },
  { name: '/SEIB-PT', id: '812325246' },
  { name: '/SEUK', id: '223093514' },
];

const config = {
  clientId: process.env.ADOBE_CLIENT_ID,
  clientSecret: process.env.ADOBE_CLIENT_SECRET,
  tenant: process.env.ADOBE_TENANT || 'samsungeu',
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

async function listActivities(accessToken, workspaceId) {
  const url = `https://mc.adobe.io/${config.tenant}/target/activities?workspace=${encodeURIComponent(workspaceId)}&limit=200`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Api-Key': config.clientId,
      'Accept': 'application/vnd.adobe.target.v3+json',
    },
  });
  const data = await res.json();
  return res.ok ? (data.activities || []) : [];
}

async function getActivityDetail(accessToken, id) {
  const url = `https://mc.adobe.io/${config.tenant}/target/activities/ab/${id}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Api-Key': config.clientId,
      'Accept': 'application/vnd.adobe.target.v3+json',
    },
  });
  const text = await res.text();
  try { return res.ok ? JSON.parse(text) : null; } catch { return null; }
}

async function deleteActivity(accessToken, id) {
  const url = `https://mc.adobe.io/${config.tenant}/target/activities/ab/${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Api-Key': config.clientId,
      'Accept': 'application/vnd.adobe.target.v3+json',
    },
  });
  return res.ok;
}

async function main() {
  const doDelete = process.argv.includes('--delete');
  if (!process.env.ADOBE_ACCESS_TOKEN?.trim() && (!config.clientId || !config.clientSecret)) {
    console.error('❌ .env에 ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET 필요 (또는 ADOBE_ACCESS_TOKEN 설정)');
    process.exit(1);
  }
  if (!config.clientId) {
    console.error('❌ ADOBE_CLIENT_ID 필요 (X-Api-Key용)');
    process.exit(1);
  }

  const token = await getToken();
  console.log('\n🔍 "API_Test"로 시작하는 Activity 검색 중...\n');

  const found = [];
  for (const ws of WORKSPACES) {
    const activities = await listActivities(token, ws.id);
    for (const a of activities) {
      if ((a.name || '').startsWith('API_Test')) {
        found.push({ ...a, workspaceName: ws.name, workspaceId: ws.id });
      }
    }
  }

  const unique = [...new Map(found.map(f => [f.id, f])).values()];
  if (unique.length === 0) {
    console.log('✓ "API_Test"로 시작하는 Activity가 없습니다.');
    process.exit(0);
  }

  console.log(`📋 총 ${unique.length}건 발견. 상세 조회 중...\n`);
  console.log('═'.repeat(60));

  const details = [];
  for (const a of unique) {
    const detail = await getActivityDetail(token, a.id);
    const d = detail || a;
    details.push({ ...d, workspaceName: a.workspaceName });
    console.log(`  ID: ${d.id}`);
    console.log(`  이름: ${d.name || '(없음)'}`);
    console.log(`  상태: ${d.state || '(없음)'}`);
    console.log(`  Workspace: ${d.workspace || a.workspaceId} (${a.workspaceName})`);
    console.log(`  수정일: ${d.modifiedAt || '(없음)'}`);
    console.log('-'.repeat(60));
  }

  console.log(`\n📌 삭제 대상: ${details.length}건\n`);

  if (!doDelete) {
    console.log('⚠️  삭제하려면 아래 명령으로 --delete 옵션 추가 후 실행하세요:');
    console.log('   node delete-api-test-activities.js --delete');
    process.exit(0);
  }

  console.log('🗑️  삭제 진행 중...\n');
  let deleted = 0;
  for (const d of details) {
    process.stdout.write(`  ID ${d.id} (${d.name}) 삭제... `);
    if (await deleteActivity(token, d.id)) {
      console.log('✓');
      deleted++;
    } else {
      console.log('✗ 실패');
    }
  }
  console.log(`\n✓ 완료: ${deleted}/${details.length}건 삭제됨`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
