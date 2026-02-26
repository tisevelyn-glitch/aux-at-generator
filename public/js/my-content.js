/**
 * My Activities & Offers 탭 — 전체 워크스페이스 목록 조회 (테이블에 Workspace 표시)
 */
(function () {
    var myContentLoadBtn = document.getElementById('myContentLoadBtn');
    var myContentStatus = document.getElementById('myContentStatus');
    var myActivitiesList = document.getElementById('myActivitiesList');
    var myOffersList = document.getElementById('myOffersList');
    var tabCreate = document.getElementById('tab-create');
    var tabMyContent = document.getElementById('tab-my-content');
    var tabBtns = document.querySelectorAll('.tab-btn');

    var myActivitiesStatus = document.getElementById('myActivitiesStatus');

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

    function renderActivityRow(a) {
        var ws = a.workspaceName || a.workspaceId || '—';
        var id = a.id || a.activityId || '—';
        var name = (a.name != null ? a.name : '—');
        var state = (a.state != null ? a.state : (a.status != null ? a.status : '—'));
        var updated = a.updatedAt || a.modifiedAt || a.lastModified || '—';
        return '<div class="content-list-item content-list-item-ws" data-activity-id="' + escapeHtml(String(id)) + '">' +
            '<span class="content-list-check"><input type="checkbox" class="activity-row-cb" value="' + escapeHtml(String(id)) + '" aria-label="Select"></span>' +
            '<span class="content-list-ws">' + escapeHtml(String(ws)) + '</span>' +
            '<span class="content-list-id">' + escapeHtml(String(id)) + '</span>' +
            '<span class="content-list-name">' + escapeHtml(name) + '</span>' +
            '<span class="content-list-meta">' + escapeHtml(String(state)) + ' · ' + escapeHtml(String(updated).slice(0, 10)) + '</span>' +
            '<span class="content-list-actions"><button type="button" class="btn-remove-from-mine" data-activity-id="' + escapeHtml(String(id)) + '" title="내 목록에서 제외">제외</button></span>' +
            '</div>';
    }

    function renderOfferRow(o) {
        var ws = o.workspaceName || o.workspaceId || '—';
        var id = o.id || o.offerId || '—';
        var name = (o.name != null ? o.name : '—');
        var updated = o.updatedAt || o.modifiedAt || o.lastModified || '—';
        return '<div class="content-list-item content-list-item-ws">' +
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
        '<span class="content-list-meta">State · Updated</span>' +
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
        '<span class="content-list-ws">Workspace</span>' +
        '<span class="content-list-id">ID</span>' +
        '<span class="content-list-name">Name</span>' +
        '<span class="content-list-meta">Updated</span>' +
        '</div>';

    function loadContent() {
        showStatus('Loading all workspaces...', 'loading');
        myActivitiesList.innerHTML = '';
        myOffersList.innerHTML = '';

        Promise.all([
            fetchJson(API_BASE + '/activities/list').then(function (r) { return r.data; }),
            fetchJson(API_BASE + '/offers/list').then(function (r) { return r.data; })
        ]).then(function (results) {
            var actRes = results[0];
            var offRes = results[1];

            if (actRes.activities && Array.isArray(actRes.activities)) {
                lastActivities = actRes.activities;
                applyActivityFilter();
            } else {
                lastActivities = [];
                myActivitiesList.innerHTML = '<p class="content-list-empty">' + (actRes.error || 'Failed to load activities.') + '</p>';
            }

            if (offRes.offers && Array.isArray(offRes.offers)) {
                myOffersList.innerHTML = offRes.offers.length === 0
                    ? '<p class="content-list-empty">No offers.</p>'
                    : offersHeader + offRes.offers.map(renderOfferRow).join('');
            } else {
                myOffersList.innerHTML = '<p class="content-list-empty">' + (offRes.error || 'Failed to load offers.') + '</p>';
            }

            showStatus('Loaded.', 'success');
        }).catch(function (err) {
            showStatus('Error: ' + (err.message || 'Request failed'), 'error');
            lastActivities = [];
            myActivitiesList.innerHTML = '<p class="content-list-empty">Error loading.</p>';
            myOffersList.innerHTML = '<p class="content-list-empty">Error loading.</p>';
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
    function openEditModal(activityId) {
        if (!activityId) return;
        document.getElementById('activityEditId').value = activityId;
        activityEditModal.style.display = 'flex';
        fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId)).then(function (r) {
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
        var statePromise = fetchJson(API_BASE + '/activities/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityId: activityId, state: state })
        });
        var optionsPromise = options.length > 0
            ? fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId) + '/options', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ options: options })
            })
            : Promise.resolve({ ok: true });
        Promise.all([statePromise, optionsPromise]).then(function () {
            showStatus('Saved.', 'success');
            closeEditModal();
            loadContent();
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
            openEditModal(ids[0]);
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
                fetchJson(API_BASE + '/activities/' + encodeURIComponent(id), { method: 'DELETE' })
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
    if (myContentLoadBtn) myContentLoadBtn.addEventListener('click', loadContent);
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
