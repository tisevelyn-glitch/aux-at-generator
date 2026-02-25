#!/usr/bin/env node
/**
 * AT Activity Generator - Web server
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const atApi = require('./lib/at-api');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// API: 토큰/연결 확인 (페이지 로드 시 호출 권장)
app.get('/api/token-check', async (req, res) => {
  try {
    await atApi.getToken();
    res.json({ ok: true, message: 'Adobe 연결됨' });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || '토큰 실패' });
  }
});

// API: 워크스페이스 목록 (각 w/s별 propertyIds 포함 — .env ADOBE_PROPERTY_IDS_<workspaceId> 또는 ADOBE_PROPERTY_IDS)
app.get('/api/workspaces', (req, res) => {
  res.json({ workspaces: atApi.getWorkspacesWithPropertyIds() });
});

// API: Offer 단독 생성 (Create offer만, Activity 없음)
app.post('/api/offers', async (req, res) => {
  try {
    const { workspaceId, offerName, offerContent } = req.body || {};
    const wsId = String(workspaceId || '').trim();
    if (!wsId) {
      return res.status(400).json({ ok: false, error: 'workspaceId 필요' });
    }
    const ws = atApi.ALL_WORKSPACES.find(w => String(w.id) === wsId);
    if (!ws) {
      return res.status(400).json({ ok: false, error: '알 수 없는 workspace' });
    }
    const token = await atApi.getToken();
    const offerId = await atApi.createOfferInWorkspace(token, ws.id, offerName || undefined, offerContent || undefined);
    res.json({ ok: true, offerId, workspace: ws.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || '서버 오류' });
  }
});

// API: Offer 단건 조회 (Retrieve offer)
app.get('/api/offers/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;
    const workspaceId = String(req.query.workspaceId || '').trim();
    if (!workspaceId) {
      return res.status(400).json({ ok: false, error: 'workspaceId 쿼리 필요' });
    }
    const token = await atApi.getToken();
    const offer = await atApi.getOfferById(token, offerId, workspaceId);
    if (!offer) {
      return res.status(404).json({ ok: false, error: 'Offer를 찾을 수 없거나 해당 워크스페이스에 없습니다.' });
    }
    res.json({ ok: true, offer: { id: offer.id, name: offer.name, content: offer.content } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || '서버 오류' });
  }
});

// API: Activity 생성 — offerMode 'retrieve'(offerId 사용) | 'create'(offerName + offerContent로 새 Offer 생성 후 사용)
app.post('/api/create-activity', async (req, res) => {
  try {
    const {
      workspaceId,
      offerMode,
      offerId,
      offerName,
      offerContent,
      activityName,
      state,
      propertyIds,
      mboxName,
      priority,
      controlName,
      variationName,
      visitorPctControl,
      visitorPctVariation,
    } = req.body || {};
    const wsId = String(workspaceId || '').trim();
    if (!wsId) {
      return res.status(400).json({ ok: false, error: 'workspaceId 필요' });
    }
    const ws = atApi.ALL_WORKSPACES.find(w => String(w.id) === wsId);
    if (!ws) {
      return res.status(400).json({ ok: false, error: '알 수 없는 workspace' });
    }

    const token = await atApi.getToken();
    let offerIdToUse = null;

    if (offerMode === 'retrieve') {
      const id = offerId ? String(offerId).trim() : '';
      if (!id) return res.status(400).json({ ok: false, error: 'Retrieve 모드에서는 Offer ID를 입력하세요.' });
      offerIdToUse = id;
    } else if (offerMode === 'create') {
      offerIdToUse = await atApi.createOfferInWorkspace(token, ws.id, offerName || undefined, offerContent || undefined);
    } else {
      return res.status(400).json({ ok: false, error: 'Offer: Retrieve offer 또는 Create offer 중 하나를 선택하세요.' });
    }

    const result = await atApi.createActivity(token, ws.id, offerIdToUse, {
      activityName,
      state,
      propertyIds,
      mboxName,
      priority,
      controlName,
      variationName,
      visitorPctControl,
      visitorPctVariation,
    });
    if (!result.ok) {
      const errMsg = result.data?.errors?.[0]?.message || result.data?.message || result.data?.error || 'Activity 생성 실패';
      return res.status(400).json({ ok: false, error: errMsg, details: result.data });
    }
    res.json({
      ok: true,
      activityId: result.data?.id,
      activityName: result.data?.name,
      workspace: ws.name,
      offerIdUsed: offerIdToUse,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || '서버 오류' });
  }
});

// 메인 화면 (전체 폼: 워크스페이스, Offer, Activity, 경험)
app.get('/', (req, res) => {
  res.type('text/html').send(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AT Activity Generator</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background: #f5f5f5; }
    h1 { margin: 0 0 8px; font-size: 1.5rem; color: #333; }
    .sub { color: #666; font-size: 0.9rem; margin-bottom: 20px; }
    .card { background: #fff; border-radius: 8px; padding: 18px 20px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { margin: 0 0 12px; font-size: 0.95rem; color: #1473e6; font-weight: 600; }
    label { display: block; margin-bottom: 4px; font-weight: 500; color: #333; font-size: 0.9rem; }
    select, input[type="text"], input[type="number"] { width: 100%; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; margin-bottom: 10px; }
    input[type="number"] { max-width: 80px; }
    .row { margin-bottom: 10px; }
    .row:last-child { margin-bottom: 0; }
    .flex { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .flex .row { flex: 1; min-width: 120px; margin-bottom: 0; }
    button { background: #1473e6; color: #fff; border: none; padding: 12px 24px; border-radius: 6px; font-size: 1rem; cursor: pointer; margin-top: 8px; }
    button:hover { background: #0d66d0; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    #result { margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 0.9rem; white-space: pre-wrap; word-break: break-all; }
    #result.success { background: #e6f4ea; color: #1e7e34; border: 1px solid #1e7e34; }
    #result.error { background: #fce8e6; color: #c5221f; border: 1px solid #c5221f; }
    .hint { font-size: 0.8rem; color: #666; margin-top: 2px; font-weight: 400; }
    .offer-mode-btns { display: flex; gap: 10px; margin-bottom: 14px; }
    .offer-mode-btns button { margin-top: 0; }
    .offer-mode-btns button.active { background: #0d66d0; }
    .offer-panel { display: none; margin-top: 10px; }
    .offer-panel.on { display: block; }
    textarea { width: 100%; min-height: 120px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; font-family: monospace; resize: vertical; }
    .offer-selected { margin-top: 10px; padding: 10px; background: #e8f4fc; border-radius: 6px; font-size: 0.9rem; }
    #tokenStatus { padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 0.9rem; }
    #tokenStatus.ok { background: #e6f4ea; color: #1e7e34; }
    #tokenStatus.fail { background: #fce8e6; color: #c5221f; }
    #tokenStatus.pending { background: #fef3cd; color: #856404; }
  </style>
</head>
<body>
  <div id="tokenStatus" class="pending">Adobe 연결 확인 중…</div>
  <h1>AT Activity Generator</h1>
  <p class="sub">Adobe Target Admin API – 워크스페이스별 Activity/Offer 생성</p>

  <form id="form">
    <div class="card">
      <h2>1. 워크스페이스</h2>
      <div class="row">
        <label for="workspace">워크스페이스</label>
        <select id="workspace" required>
          <option value="">선택하세요</option>
        </select>
      </div>
    </div>

    <div class="card">
      <h2>2. Offer – Activity에 사용할 Offer 선택</h2>
      <p class="hint" style="margin-bottom: 10px;">먼저 아래 버튼으로 기존 Offer를 가져오거나, 새 Offer를 만들 후 Activity 생성 시 사용합니다.</p>
      <div class="offer-mode-btns">
        <button type="button" id="btnRetrieveOffer" class="offer-mode-btn">Retrieve offer</button>
        <button type="button" id="btnCreateOffer" class="offer-mode-btn">Create offer</button>
      </div>
      <input type="hidden" id="offerMode" value="">
      <div id="panelRetrieve" class="offer-panel">
        <div class="row">
          <label for="offerId">Offer ID <span class="hint">해당 워크스페이스에 있는 기존 Offer ID</span></label>
          <input type="text" id="offerId" placeholder="예: 2101999">
        </div>
        <button type="button" id="btnDoRetrieve">Retrieve offer</button>
        <div id="retrieveResult" class="offer-selected" style="display:none;"></div>
      </div>
      <div id="panelCreate" class="offer-panel">
        <div class="row">
          <label for="offerName">Offer 이름 <span class="hint">(선택) 비우면 자동 생성</span></label>
          <input type="text" id="offerName" placeholder="예: My_Offer_2026">
        </div>
        <div class="row">
          <label for="offerContent">HTML Offer 코드 <span class="hint">새로 만들 HTML Offer의 본문. 비우면 기본 &lt;div&gt;Test content&lt;/div&gt; 사용</span></label>
          <textarea id="offerContent" placeholder="<div>Your HTML here</div>"></textarea>
        </div>
        <button type="button" id="btnDoCreateOffer">Create offer</button>
        <div id="createOfferResult" class="offer-selected" style="display:none;"></div>
        <input type="hidden" id="createdOfferId" value="">
      </div>
    </div>

    <div class="card">
      <h2>3. Activity</h2>
      <div class="row">
        <label for="activityName">Activity 이름 <span class="hint">(선택) 비우면 자동 생성</span></label>
        <input type="text" id="activityName" placeholder="예: API_Test_Activity_2026">
      </div>
      <div class="row">
        <label for="activityState">상태 <span class="hint">기본: saved</span></label>
        <select id="activityState">
          <option value="saved" selected>saved</option>
          <option value="approved">approved</option>
        </select>
      </div>
      <div class="row">
        <label for="propertyIds">Property IDs <span class="hint">(non-default workspace 필수) 쉼표 구분. .env ADOBE_PROPERTY_IDS 또는 여기 입력. Target 관리 &gt; 속성에서 확인</span></label>
        <input type="text" id="propertyIds" placeholder="예: 12345 또는 111,222">
      </div>
      <div class="row">
        <label for="mboxName">Mbox 이름 <span class="hint">(선택) 기본값: default</span></label>
        <input type="text" id="mboxName" placeholder="default" value="default">
      </div>
      <div class="row">
        <label for="priority">Priority <span class="hint">(선택) 0–100, 기본 5</span></label>
        <input type="number" id="priority" min="0" max="100" value="5" placeholder="5">
      </div>
    </div>

    <div class="card">
      <h2>4. 경험 (Experience)</h2>
      <div class="row">
        <label for="controlName">Control 경험 이름</label>
        <input type="text" id="controlName" value="Control" placeholder="Control">
      </div>
      <div class="row">
        <label for="variationName">Variation 경험 이름</label>
        <input type="text" id="variationName" value="Var1" placeholder="Var1">
      </div>
      <div class="flex">
        <div class="row">
          <label for="visitorPctControl">Control 트래픽 %</label>
          <input type="number" id="visitorPctControl" min="0" max="100" value="50" placeholder="50">
        </div>
        <div class="row">
          <label for="visitorPctVariation">Variation 트래픽 %</label>
          <input type="number" id="visitorPctVariation" min="0" max="100" value="50" placeholder="50">
        </div>
      </div>
    </div>

    <button type="submit" id="btn">Activity 생성</button>
  </form>

  <div id="result" style="display:none;"></div>

  <script>
    const form = document.getElementById('form');
    const resultEl = document.getElementById('result');
    const btn = document.getElementById('btn');

    fetch('/api/token-check').then(r => r.json()).then(d => {
      const el = document.getElementById('tokenStatus');
      if (d.ok) { el.textContent = '✓ ' + (d.message || 'Adobe 연결됨'); el.className = 'ok'; }
      else { el.textContent = '✗ 토큰 오류: ' + (d.error || '연결 실패'); el.className = 'fail'; }
    }).catch(e => {
      document.getElementById('tokenStatus').textContent = '✗ 연결 확인 실패: ' + (e.message || '네트워크 오류');
      document.getElementById('tokenStatus').className = 'fail';
    });

    var workspacesList = [];
    fetch('/api/workspaces').then(r => r.json()).then(d => {
      workspacesList = d.workspaces || [];
      const sel = document.getElementById('workspace');
      workspacesList.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        const pids = (w.propertyIds && w.propertyIds.length) ? w.propertyIds.join(', ') : '';
        opt.textContent = w.name + ' (' + w.id + ')' + (pids ? ' – Property: ' + pids : '');
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function() {
        var id = this.value;
        var w = workspacesList.find(function(x) { return x.id === id; });
        document.getElementById('propertyIds').value = (w && w.propertyIds && w.propertyIds.length) ? w.propertyIds.join(', ') : '';
      });
    }).catch(() => { resultEl.style.display = 'block'; resultEl.className = 'error'; resultEl.textContent = '워크스페이스 목록 로드 실패'; });

    (function() {
      const panelRetrieve = document.getElementById('panelRetrieve');
      const panelCreate = document.getElementById('panelCreate');
      const offerModeEl = document.getElementById('offerMode');
      const btnRetrieve = document.getElementById('btnRetrieveOffer');
      const btnCreate = document.getElementById('btnCreateOffer');
      const btnDoRetrieve = document.getElementById('btnDoRetrieve');
      const retrieveResult = document.getElementById('retrieveResult');
      function setMode(mode) {
        offerModeEl.value = mode;
        panelRetrieve.classList.toggle('on', mode === 'retrieve');
        panelCreate.classList.toggle('on', mode === 'create');
        btnRetrieve.classList.toggle('active', mode === 'retrieve');
        btnCreate.classList.toggle('active', mode === 'create');
        if (mode !== 'retrieve') retrieveResult.style.display = 'none';
      }
      btnRetrieve.addEventListener('click', function() { setMode('retrieve'); });
      btnCreate.addEventListener('click', function() { setMode('create'); });
      btnDoRetrieve.addEventListener('click', async function() {
        const ws = document.getElementById('workspace').value;
        const id = document.getElementById('offerId').value.trim();
        if (!ws) { retrieveResult.style.display = 'block'; retrieveResult.className = 'offer-selected'; retrieveResult.style.background = '#fce8e6'; retrieveResult.textContent = '먼저 워크스페이스를 선택하세요.'; return; }
        if (!id) { retrieveResult.style.display = 'block'; retrieveResult.className = 'offer-selected'; retrieveResult.style.background = '#fce8e6'; retrieveResult.textContent = 'Offer ID를 입력하세요.'; return; }
        retrieveResult.style.display = 'none';
        try {
          const r = await fetch('/api/offers/' + encodeURIComponent(id) + '?workspaceId=' + encodeURIComponent(ws));
          const d = await r.json();
          retrieveResult.style.display = 'block';
          retrieveResult.style.background = '#e8f4fc';
          if (d.ok) {
            retrieveResult.innerHTML = '선택된 Offer: ID <strong>' + d.offer.id + '</strong>, 이름: <strong>' + (d.offer.name || '-') + '</strong>' + (d.offer.content ? '<br><small>Content (일부): ' + String(d.offer.content).slice(0, 80) + '...</small>' : '');
          } else {
            retrieveResult.style.background = '#fce8e6';
            retrieveResult.textContent = d.error || '조회 실패';
          }
        } catch (e) {
          retrieveResult.style.display = 'block'; retrieveResult.style.background = '#fce8e6'; retrieveResult.textContent = e.message || '요청 실패';
        }
      });

      const createOfferResult = document.getElementById('createOfferResult');
      const createdOfferIdEl = document.getElementById('createdOfferId');
      document.getElementById('btnDoCreateOffer').addEventListener('click', async function() {
        const ws = document.getElementById('workspace').value;
        if (!ws) { createOfferResult.style.display = 'block'; createOfferResult.style.background = '#fce8e6'; createOfferResult.textContent = '먼저 워크스페이스를 선택하세요.'; return; }
        createOfferResult.style.display = 'none';
        try {
          const r = await fetch('/api/offers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId: ws,
              offerName: document.getElementById('offerName').value.trim() || undefined,
              offerContent: document.getElementById('offerContent').value.trim() || undefined,
            }),
          });
          const d = await r.json();
          createOfferResult.style.display = 'block';
          if (d.ok) {
            createOfferResult.style.background = '#e6f4ea';
            createOfferResult.innerHTML = 'Offer 생성됨: ID <strong>' + d.offerId + '</strong> (워크스페이스: ' + d.workspace + '). 이 Offer로 Activity 생성 시 사용됩니다.';
            createdOfferIdEl.value = d.offerId;
          } else {
            createOfferResult.style.background = '#fce8e6';
            createOfferResult.textContent = d.error || 'Offer 생성 실패';
            createdOfferIdEl.value = '';
          }
        } catch (e) {
          createOfferResult.style.display = 'block'; createOfferResult.style.background = '#fce8e6'; createOfferResult.textContent = e.message || '요청 실패';
          createdOfferIdEl.value = '';
        }
      });
    })();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = document.getElementById('offerMode').value;
      if (!mode) {
        resultEl.style.display = 'block'; resultEl.className = 'error';
        resultEl.textContent = 'Offer: "Retrieve offer" 또는 "Create offer" 중 하나를 선택한 뒤 진행하세요.';
        return;
      }
      resultEl.style.display = 'none';
      btn.disabled = true;
      const num = (id) => { const v = document.getElementById(id).value; return v === '' ? undefined : Number(v); };
      const str = (id) => document.getElementById(id).value.trim() || undefined;
      const payload = {
        workspaceId: document.getElementById('workspace').value,
        offerMode: mode,
        activityName: str('activityName'),
        state: document.getElementById('activityState').value || 'saved',
        propertyIds: str('propertyIds'),
        mboxName: str('mboxName'),
        priority: num('priority'),
        controlName: str('controlName'),
        variationName: str('variationName'),
        visitorPctControl: num('visitorPctControl'),
        visitorPctVariation: num('visitorPctVariation'),
      };
      if (mode === 'retrieve') payload.offerId = str('offerId');
      if (mode === 'create') {
        var createdId = document.getElementById('createdOfferId').value.trim();
        if (createdId) {
          payload.offerMode = 'retrieve';
          payload.offerId = createdId;
        } else {
          payload.offerName = str('offerName');
          payload.offerContent = str('offerContent');
        }
      }
      try {
        const res = await fetch('/api/create-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        resultEl.style.display = 'block';
        if (data.ok) {
          resultEl.className = 'success';
          resultEl.textContent = '성공\\nActivity ID: ' + data.activityId + '\\n이름: ' + (data.activityName || '-') + '\\n워크스페이스: ' + data.workspace + '\\n사용한 Offer ID: ' + data.offerIdUsed;
        } else {
          resultEl.className = 'error';
          resultEl.textContent = data.error || '실패';
        }
      } catch (err) {
        resultEl.style.display = 'block'; resultEl.className = 'error'; resultEl.textContent = err.message || '요청 실패';
      }
      btn.disabled = false;
    });
  </script>
</body>
</html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  try {
    await atApi.getToken();
    console.log('Adobe token OK (client_credentials 사용)');
  } catch (err) {
    console.error('Adobe token 실패 (시작 시 검증):', err.message);
    console.error('  .env에 ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_TENANT 확인');
  }
});
