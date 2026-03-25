/**
 * My Activities & Offers 탭 — 전체 워크스페이스 목록 조회 (테이블에 Workspace 표시)
 */
(function () {
    var myContentLoadActivitiesBtn = document.getElementById('myContentLoadActivitiesBtn');
    var myContentLoadOffersBtn = document.getElementById('myContentLoadOffersBtn');
    var myContentStatus = document.getElementById('myContentStatus');
    var myActivitiesList = document.getElementById('myActivitiesList');
    var myOffersList = document.getElementById('myOffersList');
    var tabCreate = document.getElementById('tab-create');
    var tabMyContent = document.getElementById('tab-my-content');
    var tabBtns = document.querySelectorAll('.tab-btn');

    var myActivitiesStatus = document.getElementById('myActivitiesStatus');
    var myOffersStatus = document.getElementById('myOffersStatus');
    var myOffersBatchResult = document.getElementById('myOffersBatchResult');

    function showStatus(msg, type) {
        if (!myContentStatus) return;
        myContentStatus.textContent = msg;
        myContentStatus.className = 'status-message ' + (type || '');
        myContentStatus.style.display = msg ? 'block' : 'none';
    }
    function showActivitiesStatus(msg, type) {
        if (!myActivitiesStatus) return;
        myActivitiesStatus.textContent = msg || '';
        myActivitiesStatus.className = 'status-message ' + (type || '');
        myActivitiesStatus.style.display = msg ? 'block' : 'none';
        if (msg) myActivitiesStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function showOffersStatus(msg, type) {
        if (!myOffersStatus) return;
        myOffersStatus.textContent = msg || '';
        myOffersStatus.className = 'status-message ' + (type || '');
        myOffersStatus.style.display = msg ? 'block' : 'none';
        if (msg) myOffersStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearOffersBatchResult() {
        if (!myOffersBatchResult) return;
        myOffersBatchResult.innerHTML = '';
        myOffersBatchResult.style.display = 'none';
    }

    function setOffersBatchResult(title, items, type) {
        if (!myOffersBatchResult) return;
        var html = '';
        html += '<div class="batch-result-title">' + escapeHtml(title || 'Result') + '</div>';
        if (!items || items.length === 0) {
            html += '<div class="batch-result-empty">No details.</div>';
        } else {
            html += '<ul class="batch-result-list">';
            items.forEach(function (it) {
                var t = it.type || '';
                html += '<li class="batch-result-item ' + escapeHtml(t) + '">' + escapeHtml(it.text || '') + '</li>';
            });
            html += '</ul>';
        }
        myOffersBatchResult.className = 'batch-result ' + (type || '');
        myOffersBatchResult.innerHTML = html;
        myOffersBatchResult.style.display = 'block';
        myOffersBatchResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderActivityRow(a) {
        var ws = a.workspaceName || a.workspaceId || '—';
        var id = a.id || a.activityId || '—';
        var name = (a.name != null ? a.name : '—');
        var state = (a.state != null ? a.state : (a.status != null ? a.status : '—'));
        var updated = a.updatedAt || a.modifiedAt || a.lastModified || '—';
        var via = a.createdVia || '—';
        var viaLabel = via === 'api' ? 'API 생성' : (via === 'ui' ? 'UI 생성' : via);
        var activityType = a.activityType || 'ab';
        var typeLabel = activityType === 'xt' ? 'XT' : 'AB-M';
        var url = (typeof buildTargetAbActivityUrl === 'function') ? buildTargetAbActivityUrl(id, activityType) : '';
        var idCell = url
            ? ('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(String(id)) + '</a>')
            : escapeHtml(String(id));
        return '<div class="content-list-item content-list-item-ws" data-activity-id="' + escapeHtml(String(id)) + '" data-activity-type="' + escapeHtml(activityType) + '">' +
            '<span class="content-list-check"><input type="checkbox" class="activity-row-cb" value="' + escapeHtml(String(id)) + '" aria-label="Select"></span>' +
            '<span class="content-list-ws">' + escapeHtml(String(ws)) + '</span>' +
            '<span class="content-list-id">' + idCell + '</span>' +
            '<span class="content-list-name">' + escapeHtml(name) + '</span>' +
            '<span class="content-list-type">' + escapeHtml(typeLabel) + '</span>' +
            '<span class="content-list-meta">' + escapeHtml(String(state)) + ' · ' + escapeHtml(String(updated).slice(0, 10)) + '</span>' +
            '<span class="content-list-via">' + escapeHtml(viaLabel) + '</span>' +
            '<span class="content-list-actions"><button type="button" class="btn-remove-from-mine" data-activity-id="' + escapeHtml(String(id)) + '" title="내 목록에서 제외">제외</button></span>' +
            '</div>';
    }

    function renderOfferRow(o) {
        var ws = o.workspaceName || o.workspaceId || '—';
        var id = o.id || o.offerId || '—';
        var name = (o.name != null ? o.name : '—');
        var updated = o.updatedAt || o.modifiedAt || o.lastModified || '—';
        return '<div class="content-list-item content-list-item-ws" data-offer-id="' + escapeHtml(String(id)) + '" data-workspace-id="' + escapeHtml(String(o.workspaceId || '')) + '">' +
            '<span class="content-list-check"><input type="checkbox" class="offer-row-cb" value="' + escapeHtml(String(id)) + '" aria-label="Select"></span>' +
            '<span class="content-list-ws">' + escapeHtml(String(ws)) + '</span>' +
            '<span class="content-list-id">' + escapeHtml(String(id)) + '</span>' +
            '<span class="content-list-name">' + escapeHtml(name) + '</span>' +
            '<span class="content-list-meta">' + escapeHtml(String(updated).slice(0, 10)) + '</span>' +
            '</div>';
    }

    function escapeHtml(s) {
        if (s == null) return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    var activitiesHeader = '<div class="content-list-item content-list-item-ws content-list-header">' +
        '<span class="content-list-check"><input type="checkbox" id="activitySelectAll" aria-label="Select all"></span>' +
        '<span class="content-list-ws">Workspace</span>' +
        '<span class="content-list-id">ID</span>' +
        '<span class="content-list-name">Name</span>' +
        '<span class="content-list-type">Type</span>' +
        '<span class="content-list-meta">State · Updated</span>' +
        '<span class="content-list-via">생성 경로</span>' +
        '<span class="content-list-actions">동작</span>' +
        '</div>';
    var lastActivities = [];

    function applyActivityFilter() {
        var q = (document.getElementById('activityNameFilter') && document.getElementById('activityNameFilter').value) || '';
        var term = q.trim().toLowerCase();
        var list = term
            ? lastActivities.filter(function (a) {
                var name = (a.name != null ? String(a.name) : '');
                return name.toLowerCase().indexOf(term) !== -1;
            })
            : lastActivities;
        if (!myActivitiesList) return;
        if (list.length === 0) {
            myActivitiesList.innerHTML = lastActivities.length === 0
                ? '<p class="content-list-empty">No activities.</p>'
                : '<p class="content-list-empty">No activities match "' + escapeHtml(term) + '".</p>';
        } else {
            myActivitiesList.innerHTML = activitiesHeader + list.map(renderActivityRow).join('');
        }
        updateActivityToolbar();
    }

    var offersHeader = '<div class="content-list-item content-list-item-ws content-list-header">' +
        '<span class="content-list-check"><input type="checkbox" id="offerSelectAll" aria-label="Select all offers"></span>' +
        '<span class="content-list-ws">Workspace</span>' +
        '<span class="content-list-id">ID</span>' +
        '<span class="content-list-name">Name</span>' +
        '<span class="content-list-meta">Updated</span>' +
        '</div>';

    function loadActivities() {
        showStatus('Loading Activities...', 'loading');
        showActivitiesStatus('Loading...', 'loading');
        if (myActivitiesList) myActivitiesList.innerHTML = '<p class="content-list-empty">로딩 중...</p>';

        fetchJson(API_BASE + '/activities/list').then(function (r) {
            var actRes = r.data || {};
            if (r.ok && actRes.activities && Array.isArray(actRes.activities)) {
                lastActivities = actRes.activities;
                applyActivityFilter();
                showActivitiesStatus('Activities: ' + lastActivities.length + '개 로드됨', 'success');
                showStatus('Activities loaded.', 'success');
            } else {
                lastActivities = [];
                var actErr = actRes.error || 'Failed to load activities.';
                if (myActivitiesList) myActivitiesList.innerHTML = '<p class="content-list-empty">Activities 오류: ' + escapeHtml(String(actErr)) + '</p>';
                showActivitiesStatus('Activities 오류: ' + actErr, 'error');
                showStatus('Activities load failed.', 'error');
            }
        }).catch(function (err) {
            var msg = err.message || 'Request failed';
            showStatus('Error: ' + msg, 'error');
            showActivitiesStatus('오류: ' + msg + ' (로그인/세션, .env 확인)', 'error');
            lastActivities = [];
            if (myActivitiesList) myActivitiesList.innerHTML = '<p class="content-list-empty">Error loading. ' + escapeHtml(String(msg)) + '</p>';
        });
    }

    function loadOffers() {
        showStatus('Loading Offers...', 'loading');
        showOffersStatus('Loading...', 'loading');
        if (myOffersList) myOffersList.innerHTML = '<p class="content-list-empty">로딩 중...</p>';
        clearOffersBatchResult();

        fetchJson(API_BASE + '/offers/list').then(function (r) {
            var offRes = r.data || {};
            if (r.ok && offRes.offers && Array.isArray(offRes.offers)) {
                if (myOffersList) {
                    myOffersList.innerHTML = offRes.offers.length === 0
                        ? '<p class="content-list-empty">No offers.</p>'
                        : offersHeader + offRes.offers.map(renderOfferRow).join('');
                }
                showOffersStatus('Offers: ' + offRes.offers.length + '개 로드됨', 'success');
                showStatus('Offers loaded.', 'success');
                updateOfferToolbar();
            } else {
                var offErr = offRes.error || 'Failed to load offers.';
                if (myOffersList) myOffersList.innerHTML = '<p class="content-list-empty">Offers 오류: ' + escapeHtml(String(offErr)) + '</p>';
                showOffersStatus('Offers 오류: ' + offErr, 'error');
                showStatus('Offers load failed.', 'error');
            }
        }).catch(function (err) {
            var msg = err.message || 'Request failed';
            showStatus('Error: ' + msg, 'error');
            showOffersStatus('오류: ' + msg, 'error');
            if (myOffersList) myOffersList.innerHTML = '<p class="content-list-empty">Error loading. ' + escapeHtml(String(msg)) + '</p>';
        });
    }

    function getSelectedOfferIds() {
        if (!myOffersList) return [];
        var cbs = myOffersList.querySelectorAll('.offer-row-cb:checked');
        var ids = [];
        cbs.forEach(function (cb) { ids.push(cb.value); });
        return ids;
    }

    function updateOfferToolbar() {
        var ids = getSelectedOfferIds();
        var editBtn = document.getElementById('offerEditBtn');
        var deleteBtn = document.getElementById('offerDeleteBtn');
        if (editBtn) editBtn.setAttribute('aria-label', ids.length ? '선택 수정 (' + ids.length + '개)' : '선택 수정 (선택 후 클릭)');
        if (deleteBtn) deleteBtn.setAttribute('aria-label', ids.length ? '선택 삭제 (' + ids.length + '개)' : '선택 삭제 (선택 후 클릭)');
    }

    // row-level result UI was replaced by batch result box

    var offerEditModal = document.getElementById('offerEditModal');
    var offerEditModalClose = document.getElementById('offerEditModalClose');
    var offerEditModalCancel = document.getElementById('offerEditModalCancel');
    var offerEditSaveBtn = document.getElementById('offerEditSaveBtn');
    function openOfferEditModal(offerIds, workspaceId) {
        if (!offerIds || offerIds.length === 0) return;
        var firstId = offerIds[0];
        document.getElementById('offerEditId').value = firstId;
        document.getElementById('offerEditIds').value = JSON.stringify(offerIds);
        document.getElementById('offerEditWorkspaceId').value = workspaceId || '';
        var applyNameCb = document.getElementById('offerEditApplyName');
        if (applyNameCb) applyNameCb.checked = false;
        if (offerEditModal) offerEditModal.style.display = 'flex';
        var qs = workspaceId ? ('?workspaceId=' + encodeURIComponent(workspaceId)) : '';
        fetchJson(API_BASE + '/offers/' + encodeURIComponent(firstId) + qs).then(function (r) {
            var data = r.data || {};
            var offer = data.offer || data;
            var name = offer.name != null ? String(offer.name) : '';
            var content = offer.content != null ? String(offer.content) : '';
            document.getElementById('offerEditName').value = name;
            document.getElementById('offerEditContent').value = content;
        }).catch(function (err) {
            showOffersStatus('Offer load failed: ' + (err.message || 'Request failed'), 'error');
            if (offerEditModal) offerEditModal.style.display = 'none';
        });
    }
    function closeOfferEditModal() {
        if (offerEditModal) offerEditModal.style.display = 'none';
    }
    function saveOfferEditModal() {
        var offerId = document.getElementById('offerEditId').value;
        var workspaceId = document.getElementById('offerEditWorkspaceId').value;
        var name = document.getElementById('offerEditName').value.trim();
        var content = document.getElementById('offerEditContent').value.trim();
        if (!offerId) return;
        if (!content) {
            showOffersStatus('HTML content를 입력하세요.', 'error');
            return;
        }

        var ids;
        try { ids = JSON.parse(document.getElementById('offerEditIds').value || '[]'); } catch (e) { ids = []; }
        if (!Array.isArray(ids) || ids.length === 0) ids = [offerId];

        var applyNameCb = document.getElementById('offerEditApplyName');
        var applyName = !!(applyNameCb && applyNameCb.checked);

        offerEditSaveBtn.disabled = true;
        showOffersStatus('Saving... (' + ids.length + '개)', 'loading');
        clearOffersBatchResult();
        setOffersBatchResult('Offer 일괄 수정 진행 중...', ids.map(function (id0) {
            return { type: 'loading', text: 'ID ' + id0 + ' — 수정 시작 (변경: content' + (applyName ? ', name' : '') + ')' };
        }), 'loading');

        var done = 0;
        var results = [];
        ids.forEach(function (id) {
            var row = myOffersList && myOffersList.querySelector('.content-list-item[data-offer-id="' + id + '"]');
            var wsId = row ? row.getAttribute('data-workspace-id') : '';
            var qs = wsId ? ('?workspaceId=' + encodeURIComponent(wsId)) : '';
            var body = { content: content, workspaceId: wsId };
            if (applyName) body.name = name;
            fetchJson(API_BASE + '/offers/' + encodeURIComponent(id) + qs, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function (r) {
                if (!r || !r.ok) {
                    var errMsg = (r && r.data && r.data.error) ? r.data.error : (r && r.status ? 'HTTP ' + r.status : 'Unknown error');
                    results.push({ id: id, ok: false, message: errMsg });
                    return;
                }
                results.push({ id: id, ok: true, data: r.data });
            }).catch(function (err) {
                results.push({ id: id, ok: false, message: err.message || 'Request failed' });
            }).then(function () {
                done++;
                if (done === ids.length) {
                    var successCount = results.filter(function (x) { return x.ok; }).length;
                    var failCount = results.length - successCount;
                    var summary = successCount + '개 수정 완료.' + (failCount ? (' ' + failCount + '개 실패.') : '');
                    showOffersStatus(summary, failCount ? 'error' : 'success');
                    var lines = results.map(function (r0) {
                        if (r0.ok) return { type: 'success', text: 'ID ' + r0.id + ' — 수정 완료 (변경: content' + (applyName ? ', name' : '') + ')' };
                        return { type: 'error', text: 'ID ' + r0.id + ' — 수정 실패: ' + (r0.message || 'Unknown error') };
                    });
                    lines.push({ type: failCount ? 'error' : 'success', text: '요약: ' + summary });
                    setOffersBatchResult('Offer 일괄 수정 결과', lines, failCount ? 'error' : 'success');
                    closeOfferEditModal();
                    offerEditSaveBtn.disabled = false;
                }
            });
        });
    }
    if (offerEditModalClose) offerEditModalClose.addEventListener('click', closeOfferEditModal);
    if (offerEditModalCancel) offerEditModalCancel.addEventListener('click', closeOfferEditModal);
    if (offerEditSaveBtn) offerEditSaveBtn.addEventListener('click', saveOfferEditModal);
    if (offerEditModal) {
        offerEditModal.addEventListener('click', function (e) {
            if (e.target === offerEditModal) closeOfferEditModal();
        });
    }

    function switchTab(tabId) {
        var isCreate = tabId === 'create';
        if (tabCreate) tabCreate.style.display = isCreate ? 'block' : 'none';
        if (tabCreate) tabCreate.setAttribute('aria-hidden', isCreate ? 'false' : 'true');
        if (tabMyContent) tabMyContent.style.display = isCreate ? 'none' : 'block';
        if (tabMyContent) tabMyContent.setAttribute('aria-hidden', isCreate ? 'true' : 'false');
        tabBtns.forEach(function (btn) {
            var active = btn.getAttribute('data-tab') === tabId;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    var activityNameFilterEl = document.getElementById('activityNameFilter');
    if (activityNameFilterEl) {
        activityNameFilterEl.addEventListener('input', applyActivityFilter);
    }
    function getSelectedActivityIds() {
        if (!myActivitiesList) return [];
        var cbs = myActivitiesList.querySelectorAll('.activity-row-cb:checked');
        var ids = [];
        cbs.forEach(function (cb) { ids.push(cb.value); });
        return ids;
    }
    function updateActivityToolbar() {
        var ids = getSelectedActivityIds();
        var editBtn = document.getElementById('activityEditBtn');
        var deleteBtn = document.getElementById('activityDeleteBtn');
        if (editBtn) { editBtn.disabled = false; editBtn.setAttribute('aria-label', ids.length ? '선택 수정 (' + ids.length + '개)' : '선택 수정 (선택 후 클릭)'); }
        if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.setAttribute('aria-label', ids.length ? '선택 삭제 (' + ids.length + '개)' : '선택 삭제 (선택 후 클릭)'); }
    }
    if (myActivitiesList) {
        myActivitiesList.addEventListener('change', function (e) {
            if (e.target.id === 'activitySelectAll') {
                var checked = e.target.checked;
                myActivitiesList.querySelectorAll('.activity-row-cb').forEach(function (cb) { cb.checked = checked; });
            }
            updateActivityToolbar();
        });
        myActivitiesList.addEventListener('click', function (e) {
            var btn = e.target;
            if (btn.classList && btn.classList.contains('btn-remove-from-mine')) {
                var activityId = btn.getAttribute('data-activity-id');
                if (!activityId) return;
                btn.disabled = true;
                fetchJson(API_BASE + '/activities/remove-from-mine', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activityId: activityId })
                }).then(function () {
                    var row = btn.closest('.content-list-item');
                    if (row && !row.classList.contains('content-list-header')) row.remove();
                }).catch(function (err) {
                    showStatus('제외 실패: ' + (err.message || 'Request failed'), 'error');
                    btn.disabled = false;
                });
                return;
            }
            if (btn.classList && btn.classList.contains('activity-row-cb')) {
                updateActivityToolbar();
            }
        });
    }
    var activityEditModal = document.getElementById('activityEditModal');
    var activityEditModalClose = document.getElementById('activityEditModalClose');
    var activityEditModalCancel = document.getElementById('activityEditModalCancel');
    var activityEditSaveBtn = document.getElementById('activityEditSaveBtn');
    function openEditModal(activityId, activityType) {
        if (!activityId) return;
        document.getElementById('activityEditId').value = activityId;
        document.getElementById('activityEditId').setAttribute('data-activity-type', activityType || 'ab');
        activityEditModal.style.display = 'flex';
        var qs = (activityType === 'xt') ? '?activityType=xt' : '';
        fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId) + qs).then(function (r) {
            var act = r.data;
            var stateSelect = document.getElementById('activityEditState');
            if (stateSelect) stateSelect.value = act.state || 'saved';
            var optionsList = document.getElementById('activityEditOptionsList');
            if (!optionsList) return;
            var options = act.options || [];
            var experiences = act.experiences || [];
            var nameByOptionLocalId = {};
            experiences.forEach(function (ex) {
                var optLocs = ex.optionLocations || [];
                optLocs.forEach(function (ol) {
                    if (ol.optionLocalId != null) nameByOptionLocalId[ol.optionLocalId] = ex.name || 'Option ' + ol.optionLocalId;
                });
            });
            optionsList.innerHTML = options.map(function (opt) {
                var label = nameByOptionLocalId[opt.optionLocalId] || ('Option ' + (opt.optionLocalId ?? ''));
                var offerId = opt.offerId != null ? opt.offerId : '';
                return '<div class="form-group" style="margin-bottom:8px">' +
                    '<label>' + escapeHtml(label) + ' — Offer ID</label>' +
                    '<input type="text" class="form-control activity-edit-offer-id" data-option-local-id="' + escapeHtml(String(opt.optionLocalId)) + '" value="' + escapeHtml(String(offerId)) + '">' +
                    '</div>';
            }).join('');
        }).catch(function (err) {
            showStatus('Load failed: ' + (err.message || 'Request failed'), 'error');
            if (activityEditModal) activityEditModal.style.display = 'none';
        });
    }
    function closeEditModal() {
        if (activityEditModal) activityEditModal.style.display = 'none';
    }
    function saveEditModal() {
        var activityId = document.getElementById('activityEditId').value;
        if (!activityId) return;
        var state = document.getElementById('activityEditState').value;
        var optionInputs = activityEditModal.querySelectorAll('.activity-edit-offer-id');
        var options = [];
        optionInputs.forEach(function (inp) {
            var lid = inp.getAttribute('data-option-local-id');
            var offerId = inp.value.trim();
            if (lid != null && offerId !== '') options.push({ optionLocalId: Number(lid) || lid, offerId: Number(offerId) || offerId });
        });
        activityEditSaveBtn.disabled = true;
        var activityType = document.getElementById('activityEditId').getAttribute('data-activity-type') || 'ab';
        var typeQs = (activityType === 'xt') ? '?activityType=xt' : '';
        var statePromise = fetchJson(API_BASE + '/activities/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityId: activityId, state: state })
        });
        var optionsPromise = options.length > 0
            ? fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId) + '/options' + typeQs, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ options: options })
            })
            : Promise.resolve({ ok: true });
        Promise.all([statePromise, optionsPromise]).then(function () {
            showStatus('Saved.', 'success');
            closeEditModal();
            loadActivities();
        }).catch(function (err) {
            showStatus('Save failed: ' + (err.message || 'Request failed'), 'error');
        }).then(function () {
            activityEditSaveBtn.disabled = false;
        });
    }
    if (activityEditModalClose) activityEditModalClose.addEventListener('click', closeEditModal);
    if (activityEditModalCancel) activityEditModalCancel.addEventListener('click', closeEditModal);
    if (activityEditSaveBtn) activityEditSaveBtn.addEventListener('click', saveEditModal);
    activityEditModal.addEventListener('click', function (e) {
        if (e.target === activityEditModal) closeEditModal();
    });
    var editBtnEl = document.getElementById('activityEditBtn');
    if (editBtnEl) {
        editBtnEl.addEventListener('click', function () {
            var ids = getSelectedActivityIds();
            if (ids.length === 0) {
                showActivitiesStatus('수정할 액티비티를 체크한 뒤 다시 클릭하세요.', 'error');
                return;
            }
            var firstId = ids[0];
            var row = myActivitiesList && myActivitiesList.querySelector('.content-list-item[data-activity-id="' + firstId + '"]');
            var activityType = row ? row.getAttribute('data-activity-type') : 'ab';
            openEditModal(firstId, activityType);
        });
    }
    var deleteBtnEl = document.getElementById('activityDeleteBtn');
    if (deleteBtnEl) {
        deleteBtnEl.addEventListener('click', function () {
            var ids = getSelectedActivityIds();
            if (ids.length === 0) {
                showActivitiesStatus('삭제할 액티비티를 체크한 뒤 다시 클릭하세요.', 'error');
                return;
            }
            var msg = '선택한 ' + ids.length + '개의 액티비티를 삭제하시겠습니까?\nAdobe에서 삭제되며 되돌릴 수 없습니다.';
            if (!window.confirm(msg)) return;
            showActivitiesStatus('삭제 중...', 'loading');
            var done = 0;
            var results = [];
            ids.forEach(function (id) {
                var row = myActivitiesList && myActivitiesList.querySelector('.content-list-item[data-activity-id="' + id + '"]');
                var activityType = row ? row.getAttribute('data-activity-type') : 'ab';
                var typeQs = (activityType === 'xt') ? '?activityType=xt' : '';
                fetchJson(API_BASE + '/activities/' + encodeURIComponent(id) + typeQs, { method: 'DELETE' })
                    .then(function (result) {
                        if (!result || !result.ok) {
                            var errMsg = (result && result.data && result.data.error) ? result.data.error : (result && result.status ? 'HTTP ' + result.status : 'Unknown error');
                            results.push({ id: id, ok: false, message: errMsg });
                            return;
                        }
                        results.push({ id: id, ok: true, data: result.data });
                        var row = myActivitiesList.querySelector('.content-list-item[data-activity-id="' + id + '"]');
                        if (row && !row.classList.contains('content-list-header')) row.remove();
                        lastActivities = lastActivities.filter(function (a) { return String(a.id || a.activityId) !== String(id); });
                    })
                    .catch(function (err) {
                        results.push({ id: id, ok: false, message: err.message || 'Request failed' });
                    })
                    .then(function () {
                        done++;
                        if (done === ids.length) {
                            updateActivityToolbar();
                            var successCount = results.filter(function (r) { return r.ok; }).length;
                            var failCount = results.length - successCount;
                            var lines = [];
                            results.forEach(function (r) {
                                if (r.ok) {
                                    lines.push('ID ' + r.id + ': 삭제 완료. 응답: ' + JSON.stringify(r.data));
                                } else {
                                    lines.push('ID ' + r.id + ': 실패 — ' + r.message);
                                }
                            });
                            var summary = successCount + '개 삭제 완료.';
                            if (failCount) summary += ' ' + failCount + '개 실패.';
                            showActivitiesStatus(summary + '\n' + lines.join('\n'), failCount ? 'error' : 'success');
                        }
                    });
            });
        });
    }
    if (myContentLoadActivitiesBtn) myContentLoadActivitiesBtn.addEventListener('click', loadActivities);
    if (myContentLoadOffersBtn) myContentLoadOffersBtn.addEventListener('click', loadOffers);

    // Offers: select all + toolbar + edit/delete
    var offerEditBtnEl = document.getElementById('offerEditBtn');
    var offerDeleteBtnEl = document.getElementById('offerDeleteBtn');
    if (offerEditBtnEl) {
        offerEditBtnEl.addEventListener('click', function () {
            var ids = getSelectedOfferIds();
            if (ids.length === 0) { showOffersStatus('수정할 Offer를 체크한 뒤 다시 클릭하세요.', 'error'); return; }
            var firstId = ids[0];
            var row = myOffersList && myOffersList.querySelector('.content-list-item[data-offer-id="' + firstId + '"]');
            var wsId = row ? row.getAttribute('data-workspace-id') : '';
            openOfferEditModal(ids, wsId);
        });
    }
    if (offerDeleteBtnEl) {
        offerDeleteBtnEl.addEventListener('click', function () {
            var ids = getSelectedOfferIds();
            if (ids.length === 0) { showOffersStatus('삭제할 Offer를 체크한 뒤 다시 클릭하세요.', 'error'); return; }
            var msg = '선택한 ' + ids.length + '개의 Offer를 삭제하시겠습니까?\nAdobe에서 삭제되며 되돌릴 수 없습니다.';
            if (!window.confirm(msg)) return;
            showOffersStatus('삭제 중...', 'loading');
            clearOffersBatchResult();
            setOffersBatchResult('Offer 삭제 진행 중...', ids.map(function (id0) {
                return { type: 'loading', text: 'ID ' + id0 + ' — 삭제 시작' };
            }), 'loading');
            var done = 0;
            var results = [];
            ids.forEach(function (id) {
                var row = myOffersList && myOffersList.querySelector('.content-list-item[data-offer-id="' + id + '"]');
                var wsId = row ? row.getAttribute('data-workspace-id') : '';
                var qs = wsId ? ('?workspaceId=' + encodeURIComponent(wsId)) : '';
                fetchJson(API_BASE + '/offers/' + encodeURIComponent(id) + qs, { method: 'DELETE' })
                    .then(function (result) {
                        if (!result || !result.ok) {
                            var errMsg = (result && result.data && result.data.error) ? result.data.error : (result && result.status ? 'HTTP ' + result.status : 'Unknown error');
                            results.push({ id: id, ok: false, message: errMsg });
                            return;
                        }
                        results.push({ id: id, ok: true });
                        var rowEl = myOffersList.querySelector('.content-list-item[data-offer-id="' + id + '"]');
                        if (rowEl && !rowEl.classList.contains('content-list-header')) rowEl.remove();
                    })
                    .catch(function (err) { results.push({ id: id, ok: false, message: err.message || 'Request failed' }); })
                    .then(function () {
                        done++;
                        if (done === ids.length) {
                            updateOfferToolbar();
                            var successCount = results.filter(function (r) { return r.ok; }).length;
                            var failCount = results.length - successCount;
                            var summary = successCount + '개 삭제 완료.' + (failCount ? (' ' + failCount + '개 실패.') : '');
                            showOffersStatus(summary, failCount ? 'error' : 'success');
                            var lines = results.map(function (r0) {
                                if (r0.ok) return { type: 'success', text: 'ID ' + r0.id + ' — 삭제 완료' };
                                return { type: 'error', text: 'ID ' + r0.id + ' — 삭제 실패: ' + (r0.message || 'Unknown error') };
                            });
                            lines.push({ type: failCount ? 'error' : 'success', text: '요약: ' + summary });
                            setOffersBatchResult('Offer 삭제 결과', lines, failCount ? 'error' : 'success');
                        }
                    });
            });
        });
    }
    if (myOffersList) {
        myOffersList.addEventListener('change', function (e) {
            if (e.target.id === 'offerSelectAll') {
                var checked = e.target.checked;
                myOffersList.querySelectorAll('.offer-row-cb').forEach(function (cb) { cb.checked = checked; });
            }
            updateOfferToolbar();
        });
    }
    if (tabBtns.length) {
        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                switchTab(btn.getAttribute('data-tab'));
            });
        });
    }

    window.switchTab = switchTab;

    // 로그인 후 복귀 시 My Content 탭으로만 복원 (리스트는 사용자가 "Load all Activities & Offers" 클릭 시에만 로드 → 401 루프 방지)
    try {
        var tab = (typeof URLSearchParams !== 'undefined' && new URLSearchParams(window.location.search).get('tab')) || (sessionStorage.getItem('returnTab') || '');
        if (tab === 'my-content') {
            sessionStorage.removeItem('returnTab');
            switchTab('my-content');
        }
    } catch (e) {}
})();
