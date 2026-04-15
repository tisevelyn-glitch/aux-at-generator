/**
 * Activity 생성 + 자동화 실행 로직
 */
var createOffersBtn = document.getElementById('createOffersBtn'); // legacy (removed from UI)
var createActivitiesBtn = document.getElementById('createActivitiesBtn');
var executeBtn = document.getElementById('executeBtn'); // legacy (one-button) mode

function resetCreatedOffers() {
    if (createActivitiesBtn) createActivitiesBtn.disabled = true;
}

if (offerTypeSelect) {
    offerTypeSelect.addEventListener('change', function () {
        resetCreatedOffers();
        var mode = offerTypeSelect.value;
        if (createActivitiesBtn) createActivitiesBtn.disabled = false;
    });
    if (createActivitiesBtn) createActivitiesBtn.disabled = false;
}

// Traffic UI (activityType별 표시)
var activityTypeElForTraffic = document.getElementById('activityType');
var trafficAbSectionEl = document.getElementById('trafficAbSection');
var trafficXtSectionEl = document.getElementById('trafficXtSection');

function updateTrafficUi() {
    var t = normalizeActivityTypeFromSelect();
    var showAb = t === 'ab';
    if (trafficAbSectionEl) trafficAbSectionEl.style.display = showAb ? 'block' : 'none';
    if (trafficXtSectionEl) trafficXtSectionEl.style.display = showAb ? 'none' : 'block';
}
if (activityTypeElForTraffic) {
    activityTypeElForTraffic.addEventListener('change', function () {
        updateTrafficUi();
        resetCreatedOffers();
    });
    updateTrafficUi();
}

function activityTypeQueryForDetailFetch(activityType) {
    return (activityType === 'xt') ? '?activityType=xt' : '';
}

function formatQaPreviewForResult(qaPreview) {
    if (!qaPreview) return '';
    var lines = [];
    lines.push('--- Activity QA (append to your site page URL) ---');
    if (qaPreview.note && (!qaPreview.experiences || qaPreview.experiences.length === 0)) {
        lines.push(qaPreview.note);
    }
    var any = false;
    (qaPreview.experiences || []).forEach(function (row, ix) {
        var lid = row.experienceLocalId != null ? row.experienceLocalId : ix;
        var label = 'Experience ' + lid + (row.name ? ' — ' + row.name : '');
        if (row.qaQueryString) {
            any = true;
            lines.push(label + ':');
            lines.push('  ?' + row.qaQueryString);
        } else if (row.rawPreviewFields) {
            any = true;
            lines.push(label + ' (preview-related API fields; confirm in Target UI → Activity QA):');
            try {
                lines.push('  ' + JSON.stringify(row.rawPreviewFields).slice(0, 800));
            } catch (e) {
                lines.push('  (unserializable)');
            }
        }
    });
    if (!any && (qaPreview.experiences || []).length > 0 && !qaPreview.note) {
        lines.push('Adobe returned experiences but no known QA query fields. Use Target UI → Activity QA.');
    }
    return lines.join('\n') + '\n';
}

function defaultQaBaseUrlForWorkspaceId(workspaceId) {
    var ws = String(workspaceId || '').trim();
    if (!ws) return 'https://www.samsung.com/uk';
    // Default + UK
    if (ws === '222991964' || ws === '223093514') return 'https://www.samsung.com/uk';
    // SEG
    if (ws === '223101884') return 'https://www.samsung.com/de';
    // SEF
    if (ws === '259214924') return 'https://www.samsung.com/fr';
    // SEIB-ES
    if (ws === '808870526') return 'https://www.samsung.com/es';
    // SEIB-PT
    if (ws === '812325246') return 'https://www.samsung.com/pt';
    // SEBN
    if (ws === '223101869') return 'https://www.samsung.com/nl';
    return 'https://www.samsung.com/uk';
}

function getQaTestPageUrlFromDom(workspaceId) {
    var el = document.getElementById('qaTestPageUrl');
    var v = el && el.value ? String(el.value).trim() : '';
    if (v) return v;
    return defaultQaBaseUrlForWorkspaceId(workspaceId);
}

function appendQaLinesAfterState(activityId, activityType, workspaceId) {
    var testUrl = getQaTestPageUrlFromDom(workspaceId);
    var ws = String(workspaceId || '').trim();
    if (!ws) {
        showResult('QA preview: workspaceId missing (cannot call preview API).\n', 'error');
        return Promise.resolve();
    }
    var type = activityType === 'xt' ? 'xt' : 'ab';
    return fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId) + '/preview-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testUrl: testUrl, workspaceId: ws, activityType: type })
    }).then(function (pr) {
        var d = pr.data || {};
        if (!pr.ok) {
            showResult('QA preview API: ' + (d.error || ('HTTP ' + pr.status)) + '\n', 'error');
            return null;
        }
        var links = d.links || [];
        var name = d.activityName || '';
        var label = name || String(activityId);
        if (links.length) {
            var j;
            for (j = 0; j < links.length; j++) {
                var L = links[j];
                var suffix = links.length > 1 && L.name ? ' · ' + L.name : '';
                showResult('✅ [' + label + suffix + '] QA 링크: ' + L.url + '\n', 'success');
            }
            return;
        }
        showResult('QA preview API: 링크 없음. ' + (d.note || '') + '\n', 'error');
        var qs = activityTypeQueryForDetailFetch(type);
        return fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId) + qs).then(function (detailR) {
            var qp = detailR.data && detailR.data.qaPreview;
            if (detailR.ok && qp) {
                showResult('(Fallback) GET activity qaPreview:\n' + formatQaPreviewForResult(qp), 'success');
            }
        });
    });
}

// ── AB-M: Experience A–E (최대 5) ─────────────────────────────────
var AB_EXP_MIN = 2;
var AB_EXP_MAX = 5;
var abExperienceRowsEl = null;
var abExperienceAddBtn = null;
var trafficAbSumDisplay = null;

function experienceLetter(idx) {
    return String.fromCharCode(65 + idx);
}

function equalSplitPercent(n) {
    var base = Math.floor(100 / n);
    var rem = 100 - base * n;
    var arr = [];
    for (var i = 0; i < n; i++) {
        arr.push(base + (i < rem ? 1 : 0));
    }
    return arr;
}

function escapeHtmlAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function buildAbExperienceRowHtml(idx, pct, offerVal, defaultChecked) {
    var letter = experienceLetter(idx);
    var ph = idx === 0
        ? '비어 있으면 검색·선택 오퍼 사용'
        : 'Offer ID';
    return (
        '<div class="ab-exp-row" data-index="' + idx + '">' +
        '<div class="ab-exp-row-head">' +
        '<span class="ab-exp-title">Experience ' + letter + '</span>' +
        '<button type="button" class="btn btn-small ab-exp-remove" aria-label="Experience 제거">−</button>' +
        '</div>' +
        '<div class="ab-exp-fields">' +
        '<label class="ab-exp-label-pct" for="ab-exp-pct-' + idx + '">Traffic %</label>' +
        '<input type="number" id="ab-exp-pct-' + idx + '" class="form-control ab-exp-pct" min="0" max="100" value="' + escapeHtmlAttr(String(pct)) + '">' +
        '<div class="ab-exp-offer-wrap">' +
        '<label for="ab-exp-offer-' + idx + '">Experience ' + letter + ' Offer ID</label>' +
        '<input type="text" id="ab-exp-offer-' + idx + '" class="form-control ab-exp-offer" placeholder="' + ph + '" value="' + escapeHtmlAttr(String(offerVal)) + '"' + (defaultChecked ? ' disabled' : '') + '>' +
        '</div>' +
        '<div class="ab-exp-default-row">' +
        '<label><input type="checkbox" class="ab-exp-default"' + (defaultChecked ? ' checked' : '') + '> 기본 콘텐츠 (Default content, API offerId 0)</label>' +
        '</div>' +
        '</div>' +
        '</div>'
    );
}

function getAbExperienceSnapshotFromDom() {
    if (!abExperienceRowsEl) return [];
    var rows = abExperienceRowsEl.querySelectorAll('.ab-exp-row');
    var snap = [];
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        snap.push({
            pct: r.querySelector('.ab-exp-pct').value,
            offer: r.querySelector('.ab-exp-offer').value,
            def: r.querySelector('.ab-exp-default').checked
        });
    }
    return snap;
}

function applyAbExperienceSnapshot(snap) {
    if (!abExperienceRowsEl) return;
    var html = '';
    for (var i = 0; i < snap.length; i++) {
        html += buildAbExperienceRowHtml(i, snap[i].pct, snap[i].offer, snap[i].def);
    }
    abExperienceRowsEl.innerHTML = html;
    wireAbExperienceRowListeners();
}

function updateRemoveButtonsVisibility() {
    if (!abExperienceRowsEl) return;
    var n = abExperienceRowsEl.querySelectorAll('.ab-exp-row').length;
    abExperienceRowsEl.querySelectorAll('.ab-exp-remove').forEach(function (btn) {
        btn.style.display = n > AB_EXP_MIN ? '' : 'none';
    });
}

function updateTrafficSumDisplay() {
    if (!abExperienceRowsEl || !trafficAbSumDisplay) return;
    var inputs = abExperienceRowsEl.querySelectorAll('.ab-exp-pct');
    var sum = 0;
    inputs.forEach(function (el) {
        sum += Number(el.value) || 0;
    });
    trafficAbSumDisplay.textContent = '합계: ' + sum + '% (100이어야 합니다)';
    trafficAbSumDisplay.className = 'hint traffic-sum-display' + (sum === 100 ? ' traffic-sum-ok' : ' traffic-sum-bad');
}

function wireAbExperienceRowListeners() {
    if (!abExperienceRowsEl) return;
    abExperienceRowsEl.querySelectorAll('.ab-exp-pct').forEach(function (el) {
        el.addEventListener('input', updateTrafficSumDisplay);
    });
    abExperienceRowsEl.querySelectorAll('.ab-exp-default').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (cb.checked) {
                abExperienceRowsEl.querySelectorAll('.ab-exp-default').forEach(function (o) {
                    if (o !== cb) o.checked = false;
                });
            }
            var row = cb.closest('.ab-exp-row');
            if (row) {
                var oi = row.querySelector('.ab-exp-offer');
                if (oi) {
                    if (cb.checked) {
                        oi.value = '';
                        oi.disabled = true;
                    } else {
                        oi.disabled = false;
                    }
                }
            }
            updateTrafficSumDisplay();
        });
    });
    abExperienceRowsEl.querySelectorAll('.ab-exp-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var snap = getAbExperienceSnapshotFromDom();
            if (snap.length <= AB_EXP_MIN) return;
            var row = btn.closest('.ab-exp-row');
            var kill = row ? Number(row.getAttribute('data-index')) : -1;
            if (kill < 0 || kill >= snap.length) return;
            snap.splice(kill, 1);
            var eq = equalSplitPercent(snap.length);
            for (var i = 0; i < snap.length; i++) snap[i].pct = String(eq[i]);
            applyAbExperienceSnapshot(snap);
            updateTrafficSumDisplay();
        });
    });
    updateRemoveButtonsVisibility();
    updateTrafficSumDisplay();
}

function initAbExperienceRows() {
    abExperienceRowsEl = document.getElementById('abExperienceRows');
    abExperienceAddBtn = document.getElementById('abExperienceAddBtn');
    trafficAbSumDisplay = document.getElementById('trafficAbSumDisplay');
    if (!abExperienceRowsEl) return;
    if (abExperienceRowsEl.children.length === 0) {
        applyAbExperienceSnapshot([
            { pct: '50', offer: '', def: false },
            { pct: '50', offer: '', def: false }
        ]);
    } else {
        wireAbExperienceRowListeners();
    }
    if (abExperienceAddBtn) {
        abExperienceAddBtn.onclick = function () {
            var snap = getAbExperienceSnapshotFromDom();
            if (snap.length >= AB_EXP_MAX) return;
            var eq = equalSplitPercent(snap.length + 1);
            for (var i = 0; i < snap.length; i++) snap[i].pct = String(eq[i]);
            snap.push({ pct: String(eq[snap.length]), offer: '', def: false });
            applyAbExperienceSnapshot(snap);
        };
    }
}

function getSelectedWorkspaceIds() {
    if (window.Workspaces && typeof window.Workspaces.getSelectedWorkspaceIds === 'function') {
        return window.Workspaces.getSelectedWorkspaceIds();
    }
    var cbs = document.querySelectorAll('.workspace-cb:checked');
    var ids = [];
    cbs.forEach(function (cb) { ids.push(cb.value); });
    return ids;
}

/**
 * Experience A 칸 비움 시 — 검색·선택 오퍼 ID (기본 콘텐츠 체크 시 미사용)
 */
function getDefaultControlOfferIdFromSelection() {
    if (selectedOffer) {
        var oid = selectedOffer.id != null ? selectedOffer.id : selectedOffer.offerId;
        if (oid != null && String(oid).trim() !== '') return String(oid).trim();
    }
    if (selectedOfferId != null && String(selectedOfferId).trim() !== '') return String(selectedOfferId).trim();
    return '';
}

/** AB-M: 두 ID가 동일한 오퍼를 가리키는지 */
function abControlAndVariationOfferIdsAreDuplicate(controlRaw, variationRaw) {
    var c = String(controlRaw == null ? '' : controlRaw).trim();
    var v = String(variationRaw == null ? '' : variationRaw).trim();
    if (!c || !v) return false;
    if (c === v) return true;
    if (/^\d+$/.test(c) && /^\d+$/.test(v)) {
        try {
            return BigInt(c) === BigInt(v);
        } catch (e) {
            return false;
        }
    }
    return false;
}

function clampPct(n) {
    n = Number(n);
    if (isNaN(n)) return 50;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
}

/**
 * 서버 routes/activities.js 와 동일: xt만 구분, 그 외는 ab.
 * select 값이 비어 있거나 공백이면 abExperiences가 빠져 레거시 API로 가는 버그를 막음.
 */
function normalizeActivityTypeFromSelect() {
    var el = document.getElementById('activityType');
    var raw = el && el.value != null ? String(el.value).trim().toLowerCase() : '';
    if (raw === 'xt') return 'xt';
    return 'ab';
}

/**
 * AB-M 제출용: Experience별 offer 해석 + 합계 100% 검증
 * @returns {{ ok: boolean, error?: string, list?: Array }}
 */
function resolveAbExperiencesForSubmit() {
    if (!abExperienceRowsEl) {
        return { ok: false, error: 'AB-M UI가 초기화되지 않았습니다.' };
    }
    var rows = abExperienceRowsEl.querySelectorAll('.ab-exp-row');
    if (rows.length < AB_EXP_MIN || rows.length > AB_EXP_MAX) {
        return { ok: false, error: 'Experience는 ' + AB_EXP_MIN + '–' + AB_EXP_MAX + '개여야 합니다.' };
    }
    var list = [];
    var sum = 0;
    var dcCount = 0;
    var i;
    for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        var pct = clampPct(Number(r.querySelector('.ab-exp-pct').value));
        sum += pct;
        var offerRaw = r.querySelector('.ab-exp-offer').value.trim();
        var def = r.querySelector('.ab-exp-default').checked;
        var letter = experienceLetter(i);
        var name = 'Experience ' + letter;
        if (def) {
            dcCount++;
            list.push({ name: name, visitorPct: pct, defaultContent: true, offerId: '' });
            continue;
        }
        if (offerRaw) {
            list.push({ name: name, visitorPct: pct, defaultContent: false, offerId: offerRaw });
            continue;
        }
        if (i === 0) {
            var fb = getDefaultControlOfferIdFromSelection();
            if (fb) {
                list.push({ name: name, visitorPct: pct, defaultContent: false, offerId: fb });
            } else {
                return { ok: false, error: 'Experience A: Offer ID를 입력하거나 기본 콘텐츠를 선택하거나, Offer를 검색·선택하세요.' };
            }
        } else {
            return { ok: false, error: 'Experience ' + letter + ': Offer ID가 필요합니다. (또는 기본 콘텐츠)' };
        }
    }
    if (sum !== 100) {
        return { ok: false, error: 'Traffic 합계가 100%가 아닙니다 (현재 ' + sum + '%).' };
    }
    if (dcCount > 1) {
        return { ok: false, error: '기본 콘텐츠는 한 Experience만 지정할 수 있습니다.' };
    }
    for (var a = 0; a < list.length; a++) {
        for (var b = a + 1; b < list.length; b++) {
            if (list[a].defaultContent && list[b].defaultContent) {
                return { ok: false, error: '기본 콘텐츠는 한 Experience만 지정할 수 있습니다.' };
            }
            if (!list[a].defaultContent && !list[b].defaultContent) {
                if (abControlAndVariationOfferIdsAreDuplicate(list[a].offerId, list[b].offerId)) {
                    return { ok: false, error: '서로 다른 Offer ID가 필요합니다 (Experience ' + experienceLetter(a) + ' / ' + experienceLetter(b) + ').' };
                }
            }
        }
    }
    return { ok: true, list: list };
}

function abRowNeedsCreateOffer(rowEl, index) {
    var def = rowEl.querySelector('.ab-exp-default').checked;
    if (def) return false;
    var offerRaw = rowEl.querySelector('.ab-exp-offer').value.trim();
    if (offerRaw) return false;
    if (index === 0 && getDefaultControlOfferIdFromSelection()) return false;
    return true;
}

/** Activity create API 실패 시 서버 detail을 메시지에 포함 */
function formatActivityApiError(data, fallbackMsg) {
    var msg = (data && data.error) ? String(data.error) : (fallbackMsg || '요청 실패');
    var d = data && data.detail;
    if (d && typeof d === 'object') {
        if (d.effectiveControlOfferId != null && d.effectiveVariationOfferId != null) {
            msg += ' — effective: ' + d.effectiveControlOfferId + ' / ' + d.effectiveVariationOfferId;
        } else if (d.effectiveA != null && d.effectiveB != null) {
            msg += ' — ' + JSON.stringify({ effectiveA: d.effectiveA, effectiveB: d.effectiveB });
        } else {
            try {
                msg += '\n' + JSON.stringify(d);
            } catch (e) {}
        }
    }
    return msg;
}

/** 비기본 WS용: propertyIds 수동 / 생략 (서버와 동일 키) */
function getActivityPropertyRequestFields() {
    var omitEl = document.getElementById('activityOmitPropertyIds');
    if (omitEl && omitEl.checked) {
        return { omitPropertyIds: true };
    }
    var pidsEl = document.getElementById('activityPropertyIds');
    var raw = pidsEl ? pidsEl.value.trim() : '';
    if (!raw) return {};
    var parts = raw.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var nums = parts.map(function (p) { return Number(p); }).filter(function (n) { return !isNaN(n) && n > 0; });
    if (nums.length === 0) return {};
    return { propertyIds: nums };
}

function getActivityPriorityFromDom() {
    var el = document.getElementById('activityPriority');
    if (!el) return 5;
    var n = Number(el.value);
    if (isNaN(n)) return 5;
    if (n < 0) return 0;
    if (n > 999) return 999;
    return Math.round(n);
}

async function createOffersOnly() {
    // removed
}

async function createActivitiesOnly() {
    if (!accessToken) { showResult('Token not ready. Reload the page.\n', 'error'); return; }

    var selectedWorkspaceIds = getSelectedWorkspaceIds();
    if (selectedWorkspaceIds.length === 0) { showResult('워크스페이스를 먼저 선택하세요.\n', 'error'); return; }

    var activityName = document.getElementById('activityName').value.trim();
    var activityStatus = document.getElementById('activityStatus').value;
    var activityType = normalizeActivityTypeFromSelect();
    var offerType = offerTypeSelect ? offerTypeSelect.value : 'create';

    if (!activityName) { showResult('Please enter an activity name.\n', 'error'); return; }

    var targetWorkspaceIds = selectedWorkspaceIds;
    if (offerType === 'existing') {
        if (!selectedOfferId) { showResult('기존 Offer를 사용하려면 먼저 Offer 검색/선택을 해주세요.\n', 'error'); return; }
        if (!selectedOffer || !selectedOffer.foundInWorkspace) { showResult('기존 Offer는 해당 workspace 1개만 사용합니다. Offer 검색을 다시 해주세요.\n', 'error'); return; }

        var foundWs = selectedOffer.foundInWorkspace;
        if (selectedWorkspaceIds.indexOf(foundWs) === -1) {
            showResult('현재 선택한 워크스페이스에 해당 Offer가 없습니다. Offer가 있는 workspace를 체크하세요.\n', 'error');
            return;
        }
        targetWorkspaceIds = [foundWs];
    } else {
        if (!selectedOfferId || !selectedOffer || !selectedOffer.foundInWorkspace) {
            showResult('Offer mode=create에서는 먼저 Offer 카드에서 Create Offer로 offer를 생성하세요.\n', 'error');
            return;
        }
        var foundWs2 = selectedOffer.foundInWorkspace;
        if (selectedWorkspaceIds.indexOf(foundWs2) === -1) {
            showResult('현재 선택한 워크스페이스에 생성된 Offer의 workspace가 포함되어야 합니다.\n', 'error');
            return;
        }
        targetWorkspaceIds = [foundWs2];
    }

    var abResolved = activityType === 'ab' ? resolveAbExperiencesForSubmit() : { ok: true, list: null };
    if (activityType === 'ab' && !abResolved.ok) {
        showResult(abResolved.error + '\n', 'error');
        return;
    }
    if (activityType === 'ab' && (!abResolved.list || !abResolved.list.length)) {
        showResult('AB-M Experience 데이터(abExperiences)를 만들 수 없습니다. 페이지를 새로고침 후 다시 시도하세요.\n', 'error');
        return;
    }

    if (createActivitiesBtn) { createActivitiesBtn.disabled = true; createActivitiesBtn.textContent = 'Creating...'; }
    if (createOffersBtn) createOffersBtn.disabled = true;

    try {
        var results = [];
        for (var i = 0; i < targetWorkspaceIds.length; i++) {
            var wId = targetWorkspaceIds[i];
            var wLabel = getWorkspaceNameById(wId) || wId;
            var typeLabel = activityType === 'xt' ? 'XT' : 'AB-M';

            var actBody;
            if (activityType === 'xt') {
                var expOfferIdToUse = getDefaultControlOfferIdFromSelection();
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: activityType,
                    activityStatus: activityStatus,
                    priority: getActivityPriorityFromDom(),
                    experienceOfferId: expOfferIdToUse
                };
            } else {
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: 'ab',
                    activityStatus: activityStatus,
                    priority: getActivityPriorityFromDom(),
                    abExperiences: abResolved.list
                };
            }

            Object.assign(actBody, getActivityPropertyRequestFields());

            showResult('Creating ' + typeLabel + ' Activity for [' + wLabel + ']...\n', 'loading');
            var actR = await fetchJson(API_BASE + '/activities/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actBody)
            });
            var actData = actR.data;
            if (!actR.ok) throw new Error(formatActivityApiError(actData, '[' + wLabel + '] Failed to create activity'));
            var activityId = actData.activityId;
            showResult('[' + wLabel + '] Activity created. ID: ' + activityId + '\n', 'success');

            if (typeof buildTargetAbActivityUrl === 'function' && typeof showResultLink === 'function') {
                var url = buildTargetAbActivityUrl(activityId, activityType);
                if (url) showResultLink('Open in Target UI: ' + url, url, 'success');
            }

            showResult('Step: setting state to \'' + activityStatus + '\' for [' + wLabel + ']...\n', 'loading');
            var stateR = await fetchJson(API_BASE + '/activities/state', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activityId: activityId, state: activityStatus })
            });
            var stateData = stateR.data;
            if (!stateR.ok) throw new Error(stateData.error || '[' + wLabel + '] Failed to update activity state');
            showResult('[' + wLabel + '] State updated.\n', 'success');

            await appendQaLinesAfterState(activityId, activityType, wId);

            results.push({ workspace: wLabel, activityId: activityId });
        }

        showResult('\n=== Done ===\n', 'success');
        results.forEach(function (r) { showResult('  [' + r.workspace + '] Activity ID: ' + r.activityId + '\n', 'success'); });
    } catch (error) {
        showResult('\nError: ' + error.message + '\n', 'error');
    } finally {
        if (createActivitiesBtn) { createActivitiesBtn.disabled = false; createActivitiesBtn.textContent = 'Create Activities'; }
        if (createOffersBtn) createOffersBtn.disabled = false;
    }
}

if (createActivitiesBtn) createActivitiesBtn.addEventListener('click', createActivitiesOnly);

async function runAutomation() {
    if (!accessToken) { showResult('Token not ready. Reload the page.\n', 'error'); return; }

    function getSelectedWorkspaceIdsLocal() {
        var cbs = document.querySelectorAll('.workspace-cb:checked');
        var ids = [];
        cbs.forEach(function (cb) { ids.push(cb.value); });
        return ids;
    }

    var selectedWorkspaceIds = getSelectedWorkspaceIdsLocal();
    if (offerTypeSelect && offerTypeSelect.value === 'existing') {
        if (selectedOffer && selectedOffer.foundInWorkspace) {
            selectedWorkspaceIds = [selectedOffer.foundInWorkspace];
        }
    }

    var activityName = document.getElementById('activityName').value.trim();
    var activityStatus = document.getElementById('activityStatus').value;
    var activityType = normalizeActivityTypeFromSelect();
    var offerType = offerTypeSelect ? offerTypeSelect.value : 'create';

    if (!activityName) { showResult('Please enter an activity name.\n', 'error'); return; }

    if (offerType === 'existing') {
        if (!selectedOfferId) { showResult('기존 Offer를 사용하려면 먼저 Offer 검색/선택을 해주세요.\n', 'error'); return; }
        if (!selectedOffer || !selectedOffer.foundInWorkspace) { showResult('기존 Offer는 “해당 Offer가 있는 workspace” 1개만 사용합니다. Offer 검색을 다시 해주세요.\n', 'error'); return; }
    }
    if (selectedWorkspaceIds.length === 0) { showResult('Please select a workspace.\n', 'error'); return; }

    var abResolvedPre = activityType === 'ab' ? resolveAbExperiencesForSubmit() : { ok: true, list: null };
    if (activityType === 'ab' && !abResolvedPre.ok) {
        showResult(abResolvedPre.error + '\n', 'error');
        return;
    }
    if (activityType === 'ab' && (!abResolvedPre.list || !abResolvedPre.list.length)) {
        showResult('AB-M Experience 데이터(abExperiences)를 만들 수 없습니다. 페이지를 새로고침 후 다시 시도하세요.\n', 'error');
        return;
    }

    if (executeBtn) executeBtn.disabled = true;
    if (executeBtn) executeBtn.textContent = 'Running...';
    showResult('Starting automation...\n', 'loading');

    try {
        if (offerType === 'existing') {
            if (!selectedOfferId) throw new Error('Please search by Offer ID and select an offer.');
            if (!selectedOffer || !selectedOffer.foundInWorkspace) throw new Error('Existing offer를 사용할 workspace를 찾지 못했습니다. Offer 검색을 다시 해주세요.');
        }

        var offerContent = '';
        var offerNameBase = '';
        if (offerType === 'create') {
            offerContent = document.getElementById('offerContent').value.trim();
            offerNameBase = document.getElementById('offerName').value.trim() || activityName + '_offer';
            if (!offerContent) throw new Error('Please enter HTML Offer content.');
        }

        var results = [];
        for (var wi = 0; wi < selectedWorkspaceIds.length; wi++) {
            var wId = selectedWorkspaceIds[wi];
            var wLabel = getWorkspaceNameById(wId) || wId;
            var typeLabel = activityType === 'xt' ? 'XT' : 'AB-M';

            var experienceOfferIdToUse = getDefaultControlOfferIdFromSelection();
            var finalAbList = null;

            if (offerType === 'create') {
                if (activityType === 'xt') {
                    var expOfferNameToUse = offerNameBase + '_experience_' + wId;
                    showResult('Step 1: Creating XT offer for [' + wLabel + ']...\n', 'loading');
                    var expOfferR = await fetchJson(API_BASE + '/offers/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: expOfferNameToUse, content: offerContent, workspaceId: wId })
                    });
                    var expOfferData = expOfferR.data;
                    if (!expOfferR.ok) throw new Error(expOfferData.error || '[' + wLabel + '] Failed to create offer');
                    experienceOfferIdToUse = expOfferData.offerId;
                    showResult('[' + wLabel + '] Experience offer created. ID: ' + experienceOfferIdToUse + '\n', 'success');
                } else {
                    var abSnap = resolveAbExperiencesForSubmit();
                    if (!abSnap.ok) throw new Error(abSnap.error);
                    finalAbList = abSnap.list.map(function (row) {
                        return {
                            name: row.name,
                            visitorPct: row.visitorPct,
                            defaultContent: row.defaultContent,
                            offerId: row.offerId
                        };
                    });
                    var rowEls = document.querySelectorAll('#abExperienceRows .ab-exp-row');
                    for (var ri = 0; ri < rowEls.length; ri++) {
                        var rowEl = rowEls[ri];
                        if (!abRowNeedsCreateOffer(rowEl, ri)) continue;
                        var offerNm = offerNameBase + '_exp' + experienceLetter(ri) + '_' + wId;
                        showResult('Step 1: Creating offer for Experience ' + experienceLetter(ri) + ' [' + wLabel + ']...\n', 'loading');
                        var cr = await fetchJson(API_BASE + '/offers/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: offerNm, content: offerContent, workspaceId: wId })
                        });
                        var crd = cr.data;
                        if (!cr.ok) throw new Error(crd.error || '[' + wLabel + '] Failed to create offer');
                        finalAbList[ri] = {
                            name: finalAbList[ri].name,
                            visitorPct: finalAbList[ri].visitorPct,
                            defaultContent: false,
                            offerId: String(crd.offerId)
                        };
                    }
                    var pi, pj;
                    for (pi = 0; pi < finalAbList.length; pi++) {
                        for (pj = pi + 1; pj < finalAbList.length; pj++) {
                            if (finalAbList[pi].defaultContent && finalAbList[pj].defaultContent) {
                                throw new Error('[' + wLabel + '] 기본 콘텐츠는 한 Experience만 가능합니다.');
                            }
                            if (!finalAbList[pi].defaultContent && !finalAbList[pj].defaultContent) {
                                if (abControlAndVariationOfferIdsAreDuplicate(finalAbList[pi].offerId, finalAbList[pj].offerId)) {
                                    throw new Error('[' + wLabel + '] 서로 다른 Offer ID가 필요합니다.');
                                }
                            }
                        }
                    }
                    showResult('[' + wLabel + '] AB-M offers 준비 완료.\n', 'success');
                }
            } else {
                if (activityType === 'xt') {
                    showResult('Using existing experience offer: ' + experienceOfferIdToUse + ' for [' + wLabel + ']\n', 'success');
                } else {
                    finalAbList = abResolvedPre.list;
                    showResult('Using existing offers for AB-M [' + wLabel + ']\n', 'success');
                }
            }

            showResult('Step 2: Creating ' + typeLabel + ' Activity for [' + wLabel + ']...\n', 'loading');
            var actBody;
            if (activityType === 'xt') {
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: activityType,
                    activityStatus: activityStatus,
                    priority: getActivityPriorityFromDom(),
                    experienceOfferId: experienceOfferIdToUse
                };
            } else {
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: 'ab',
                    activityStatus: activityStatus,
                    priority: getActivityPriorityFromDom(),
                    abExperiences: finalAbList
                };
            }

            Object.assign(actBody, getActivityPropertyRequestFields());

            var actR = await fetchJson(API_BASE + '/activities/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actBody)
            });
            var actData = actR.data;
            if (!actR.ok) throw new Error(formatActivityApiError(actData, '[' + wLabel + '] Failed to create activity'));
            var activityId = actData.activityId;
            showResult('[' + wLabel + '] Activity created. ID: ' + activityId + '\n', 'success');
            if (typeof buildTargetAbActivityUrl === 'function' && typeof showResultLink === 'function') {
                var url = buildTargetAbActivityUrl(activityId, activityType === 'xt' ? 'xt' : 'ab');
                if (url) showResultLink('Open in Target UI: ' + url, url, 'success');
            }

            showResult('Step 3: Setting state to \'' + activityStatus + '\'...\n', 'loading');
            var stateR = await fetchJson(API_BASE + '/activities/state', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activityId: activityId, state: activityStatus })
            });
            var stateData = stateR.data;
            if (!stateR.ok) throw new Error(stateData.error || '[' + wLabel + '] Failed to update activity state');
            showResult('[' + wLabel + '] State updated.\n', 'success');

            await appendQaLinesAfterState(activityId, activityType, wId);

            results.push({
                workspace: wLabel,
                abExperiences: finalAbList,
                experienceOfferId: experienceOfferIdToUse,
                activityId: activityId
            });
        }

        showResult('\n=== Done ===\n', 'success');
        showResult('Activity: ' + activityName + '\n', 'success');
        showResult('State: ' + activityStatus + '\n', 'success');
        results.forEach(function (r) {
            if (activityType === 'xt') {
                showResult('  [' + r.workspace + '] Experience Offer ID: ' + r.experienceOfferId + ' / Activity ID: ' + r.activityId + '\n', 'success');
            } else {
                var parts = (r.abExperiences || []).map(function (e) {
                    return e.name + '=' + (e.defaultContent ? '0(default)' : e.offerId);
                }).join(' | ');
                showResult('  [' + r.workspace + '] ' + parts + ' / Activity ID: ' + r.activityId + '\n', 'success');
            }
        });
    } catch (error) {
        showResult('\nError: ' + error.message + '\n', 'error');
    } finally {
        if (executeBtn) { executeBtn.disabled = false; executeBtn.textContent = 'Run automation'; }
    }
}

initAbExperienceRows();
