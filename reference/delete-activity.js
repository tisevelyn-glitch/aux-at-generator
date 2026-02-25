#!/usr/bin/env node
/**
 * Adobe Target Activity 조회 및 삭제 (확인 후 실행)
 * 사용법: node delete-activity.js 1238115
 */
require('dotenv').config();
const fetch = require('node-fetch');

const activityId = process.argv[2] || '1238115';
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

async function getActivity(accessToken, id) {
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
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: res.ok, data };
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
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: res.ok, data };
}

async function main() {
  const doDelete = process.argv.includes('--delete');
  if (!process.env.ADOBE_ACCESS_TOKEN?.trim() && (!config.clientId || !config.clientSecret)) {
    console.error('❌ .env에 ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET 필요 (또는 ADOBE_ACCESS_TOKEN 설정)');
    process.exit(1);
  }

  const token = await getToken();
  console.log(`\n📋 Activity ID ${activityId} 조회 중...\n`);

  const getRes = await getActivity(token, activityId);
  if (!getRes.ok) {
    console.error('❌ 조회 실패:', getRes.data?.errors?.[0]?.message || getRes.data?.message || JSON.stringify(getRes.data));
    process.exit(1);
  }

  const act = getRes.data;
  console.log('=== Activity 상세 ===');
  console.log('  ID:', act.id);
  console.log('  이름:', act.name || '(없음)');
  console.log('  상태:', act.state || '(없음)');
  console.log('  Workspace:', act.workspace || '(없음)');
  console.log('  수정일:', act.modifiedAt || '(없음)');
  console.log('');

  if (!doDelete) {
    console.log('⚠️  삭제하려면 아래 명령으로 --delete 옵션 추가 후 실행하세요:');
    console.log(`   node delete-activity.js ${activityId} --delete`);
    process.exit(0);
  }

  console.log(`🗑️  Activity "${act.name}" (ID: ${activityId}) 삭제 중...`);
  const delRes = await deleteActivity(token, activityId);
  if (delRes.ok) {
    console.log('✓ 삭제 완료');
  } else {
    console.error('❌ 삭제 실패:', delRes.data?.errors?.[0]?.message || delRes.data?.message || JSON.stringify(delRes.data));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
