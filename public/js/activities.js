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
    // initial sync (offerTypeSelect could already be set to one mode)
    if (createActivitiesBtn) createActivitiesBtn.disabled = false;
}

// Traffic UI (activityType별 표시)
var activityTypeElForTraffic = document.getElementById('activityType');
var trafficAbSectionEl = document.getElementById('trafficAbSection');
var trafficXtSectionEl = document.getElementById('trafficXtSection');

function updateTrafficUi() {
    var t = activityTypeElForTraffic ? activityTypeElForTraffic.value : 'ab';
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

// AB-M visitor% 자동 보정 (control + variation = 100)
var controlVisitorPctEl = document.getElementById('controlVisitorPct');
var variationVisitorPctEl = document.getElementById('variationVisitorPct');
var _trafficPctLock = false;

function clampPct(n) {
    n = Number(n);
    if (isNaN(n)) return 50;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
}

if (controlVisitorPctEl) {
    controlVisitorPctEl.addEventListener('input', function () {
        if (_trafficPctLock) return;
        _trafficPctLock = true;
        var c = clampPct(controlVisitorPctEl.value);
        var v = 100 - c;
        if (variationVisitorPctEl) variationVisitorPctEl.value = String(v);
        controlVisitorPctEl.value = String(c);
        _trafficPctLock = false;
    });
}
if (variationVisitorPctEl) {
    variationVisitorPctEl.addEventListener('input', function () {
        if (_trafficPctLock) return;
        _trafficPctLock = true;
        var v = clampPct(variationVisitorPctEl.value);
        var c = 100 - v;
        if (controlVisitorPctEl) controlVisitorPctEl.value = String(c);
        variationVisitorPctEl.value = String(v);
        _trafficPctLock = false;
    });
}

function getSelectedWorkspaceIds() {
    var cbs = document.querySelectorAll('.workspace-cb:checked');
    var ids = [];
    cbs.forEach(function (cb) { ids.push(cb.value); });
    return ids;
}

async function createOffersOnly() {
    // removed: Offer 생성은 Offer 카드의 "Create Offer" 버튼으로 분리됨
}

async function createActivitiesOnly() {
    if (!accessToken) { showResult('Token not ready. Reload the page.\n', 'error'); return; }

    var selectedWorkspaceIds = getSelectedWorkspaceIds();
    if (selectedWorkspaceIds.length === 0) { showResult('워크스페이스를 먼저 선택하세요.\n', 'error'); return; }

    var activityName = document.getElementById('activityName').value.trim();
    var activityStatus = document.getElementById('activityStatus').value;
    var activityTypeEl = document.getElementById('activityType');
    var activityType = activityTypeEl ? activityTypeEl.value : 'ab';
    var offerType = offerTypeSelect ? offerTypeSelect.value : 'create';

    var controlVisitorPct = controlVisitorPctEl ? controlVisitorPctEl.value : 50;
    var variationVisitorPct = variationVisitorPctEl ? variationVisitorPctEl.value : 50;
    var variationOfferIdInput = document.getElementById('variationOfferId');
    var variationOfferId = variationOfferIdInput ? variationOfferIdInput.value.trim() : '';

    if (!activityName) { showResult('Please enter an activity name.\n', 'error'); return; }

    // 기존 offer 모드: Offer가 존재하는 workspace만 사용
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

        if (activityType === 'ab' && !variationOfferId) {
            showResult('AB-M에서는 Variation 1 Offer ID가 필요합니다. (Variation offer 매핑)\n', 'error');
            return;
        }
    } else {
        // create mode: Offer 생성 버튼으로 생성된 offerId(selectedOfferId)를 사용
        if (!selectedOfferId || !selectedOffer || !selectedOffer.foundInWorkspace) {
            showResult('Offer mode=create에서는 먼저 Offer 카드에서 Create Offer로 offer를 생성하세요.\n', 'error');
            return;
        }
        // Offer는 workspace-scoped이므로 activity도 그 workspace 1개만 처리
        var foundWs2 = selectedOffer.foundInWorkspace;
        if (selectedWorkspaceIds.indexOf(foundWs2) === -1) {
            showResult('현재 선택한 워크스페이스에 생성된 Offer의 workspace가 포함되어야 합니다.\n', 'error');
            return;
        }
        targetWorkspaceIds = [foundWs2];
        if (activityType === 'ab' && !variationOfferId) {
            showResult('AB-M에서는 Variation 1 Offer ID가 필요합니다. (Control은 방금 생성/선택한 Offer)\n', 'error');
            return;
        }
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
                var expOfferIdToUse = selectedOfferId;
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: activityType,
                    activityStatus: activityStatus,
                    experienceOfferId: expOfferIdToUse
                };
            } else {
                var controlOfferIdToUse = selectedOfferId;
                var variationOfferIdToUse = variationOfferId;
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: activityType,
                    activityStatus: activityStatus,
                    controlOfferId: controlOfferIdToUse,
                    variationOfferId: variationOfferIdToUse,
                    controlVisitorPct: controlVisitorPct,
                    variationVisitorPct: variationVisitorPct
                };
            }

            showResult('Creating ' + typeLabel + ' Activity for [' + wLabel + ']...\n', 'loading');
            var actR = await fetchJson(API_BASE + '/activities/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actBody)
            });
            var actData = actR.data;
            if (!actR.ok) throw new Error(actData.error || '[' + wLabel + '] Failed to create activity');
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

    function getSelectedWorkspaceIds() {
        var cbs = document.querySelectorAll('.workspace-cb:checked');
        var ids = [];
        cbs.forEach(function (cb) { ids.push(cb.value); });
        return ids;
    }

    var selectedWorkspaceIds = getSelectedWorkspaceIds();
    if (offerTypeSelect && offerTypeSelect.value === 'existing') {
        // 기존 Offer는 "해당 Offer가 존재하는 workspace" 1개만 사용
        if (selectedOffer && selectedOffer.foundInWorkspace) {
            selectedWorkspaceIds = [selectedOffer.foundInWorkspace];
        }
    }

    var activityName = document.getElementById('activityName').value.trim();
    var activityStatus = document.getElementById('activityStatus').value;
    var activityTypeEl = document.getElementById('activityType');
    var activityType = activityTypeEl ? activityTypeEl.value : 'ab';
    var offerType = offerTypeSelect ? offerTypeSelect.value : 'create';

    var controlVisitorPct = controlVisitorPctEl ? controlVisitorPctEl.value : 50;
    var variationVisitorPct = variationVisitorPctEl ? variationVisitorPctEl.value : 50;
    var variationOfferIdInput = document.getElementById('variationOfferId');
    var variationOfferId = variationOfferIdInput ? variationOfferIdInput.value.trim() : '';

    if (!activityName) { showResult('Please enter an activity name.\n', 'error'); return; }

    // activityType별 최소 입력값 검증
    if (offerType === 'existing') {
        if (!selectedOfferId) { showResult('기존 Offer를 사용하려면 먼저 Offer 검색/선택을 해주세요.\n', 'error'); return; }
        if (!selectedOffer || !selectedOffer.foundInWorkspace) { showResult('기존 Offer는 “해당 Offer가 있는 workspace” 1개만 사용합니다. Offer 검색을 다시 해주세요.\n', 'error'); return; }
        if (activityType === 'ab' && !variationOfferId) {
            showResult('AB-M에서는 Variation 1 Offer ID가 추가로 필요합니다. (Variation offer 매핑)\n', 'error');
            return;
        }
    }
    if (selectedWorkspaceIds.length === 0) { showResult('Please select a workspace.\n', 'error'); return; }

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

        // Offer/Activity per workspace
        var results = [];
        for (var i = 0; i < selectedWorkspaceIds.length; i++) {
            var wId = selectedWorkspaceIds[i];
            var wLabel = getWorkspaceNameById(wId) || wId;
            var typeLabel = activityType === 'xt' ? 'XT' : 'AB-M';

            var controlOfferIdToUse = selectedOfferId;
            var variationOfferIdToUse = variationOfferId;
            var experienceOfferIdToUse = selectedOfferId;

            // Step 1: Offer(s) 생성/매핑
            if (offerType === 'create') {
                if (activityType === 'xt') {
                    // XT는 Experience 1 단일
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
                    // AB-M는 Control/Variation Offer를 각각 생성
                    var controlOfferNameToUse = offerNameBase + '_control_' + wId;
                    var variationOfferNameToUse = offerNameBase + '_variation_' + wId;

                    showResult('Step 1: Creating Control offer for [' + wLabel + ']...\n', 'loading');
                    var controlOfferR = await fetchJson(API_BASE + '/offers/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: controlOfferNameToUse, content: offerContent, workspaceId: wId })
                    });
                    var controlOfferData = controlOfferR.data;
                    if (!controlOfferR.ok) throw new Error(controlOfferData.error || '[' + wLabel + '] Failed to create control offer');
                    controlOfferIdToUse = controlOfferData.offerId;
                    showResult('[' + wLabel + '] Control offer created. ID: ' + controlOfferIdToUse + '\n', 'success');

                    showResult('Step 1: Creating Variation offer for [' + wLabel + ']...\n', 'loading');
                    var variationOfferR = await fetchJson(API_BASE + '/offers/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: variationOfferNameToUse, content: offerContent, workspaceId: wId })
                    });
                    var variationOfferData = variationOfferR.data;
                    if (!variationOfferR.ok) throw new Error(variationOfferData.error || '[' + wLabel + '] Failed to create variation offer');
                    variationOfferIdToUse = variationOfferData.offerId;
                    showResult('[' + wLabel + '] Variation offer created. ID: ' + variationOfferIdToUse + '\n', 'success');
                }
            } else {
                // existing offer 모드
                if (activityType === 'xt') {
                    showResult('Using existing experience offer: ' + experienceOfferIdToUse + ' for [' + wLabel + ']\n', 'success');
                } else {
                    showResult('Using existing Control offer: ' + controlOfferIdToUse + ', Variation offer: ' + variationOfferIdToUse + ' for [' + wLabel + ']\n', 'success');
                }
            }

            // Step 2: Activity 생성
            showResult('Step 2: Creating ' + typeLabel + ' Activity for [' + wLabel + ']...\n', 'loading');
            var actBody;
            if (activityType === 'xt') {
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: activityType,
                    activityStatus: activityStatus,
                    experienceOfferId: experienceOfferIdToUse
                };
            } else {
                actBody = {
                    name: activityName,
                    workspaceId: wId,
                    activityType: activityType,
                    activityStatus: activityStatus,
                    controlOfferId: controlOfferIdToUse,
                    variationOfferId: variationOfferIdToUse,
                    controlVisitorPct: controlVisitorPct,
                    variationVisitorPct: variationVisitorPct
                };
            }

            var actR = await fetchJson(API_BASE + '/activities/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actBody)
            });
            var actData = actR.data;
            if (!actR.ok) throw new Error(actData.error || '[' + wLabel + '] Failed to create activity');
            var activityId = actData.activityId;
            showResult('[' + wLabel + '] Activity created. ID: ' + activityId + '\n', 'success');
            if (typeof buildTargetAbActivityUrl === 'function' && typeof showResultLink === 'function') {
                var url = buildTargetAbActivityUrl(activityId, activityType);
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
            results.push({
                workspace: wLabel,
                controlOfferId: controlOfferIdToUse,
                variationOfferId: variationOfferIdToUse,
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
                showResult('  [' + r.workspace + '] Control Offer ID: ' + r.controlOfferId + ' / Variation Offer ID: ' + r.variationOfferId + ' / Activity ID: ' + r.activityId + '\n', 'success');
            }
        });
    } catch (error) {
        showResult('\nError: ' + error.message + '\n', 'error');
    } finally {
        if (executeBtn) { executeBtn.disabled = false; executeBtn.textContent = 'Run automation'; }
    }
}
