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
        var pri = (a.priority != null && a.priority !== '') ? String(a.priority) : '—';
        var updated = a.updatedAt || a.modifiedAt || a.lastModified || '—';
        var via = a.createdVia || '—';
        var viaLabel = via === 'api' ? 'API' : (via === 'ui' ? 'Target UI' : via);
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
            '<span class="content-list-meta">' + escapeHtml(String(state)) + ' · P:' + escapeHtml(pri) + ' · ' + escapeHtml(String(updated).slice(0, 10)) + '</span>' +
            '<span class="content-list-via">' + escapeHtml(viaLabel) + '</span>' +
            '<span class="content-list-actions"><button type="button" class="btn-remove-from-mine" data-activity-id="' + escapeHtml(String(id)) + '" title="Remove from this app list">Remove</button></span>' +
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

    /** @returns {string|null} query fragment workspaceIds=... or null if none checked */
    function buildMyContentWorkspaceQueryParam() {
        var cbs = document.querySelectorAll('.my-content-ws-cb:checked');
        if (!cbs.length) return null;
        var ids = [];
        cbs.forEach(function (cb) {
            var v = String(cb.value || '').trim();
            if (v) ids.push(v);
        });
        if (!ids.length) return null;
        var p = new URLSearchParams();
        p.set('workspaceIds', ids.join(','));
        return p.toString();
    }

    /** 체크된 My Content 워크스페이스 ID만 남김 (서버 응답이 범위를 벗어난 경우 방어) */
    function filterListByCheckedWorkspaces(rows, idKey) {
        idKey = idKey || 'workspaceId';
        var cbs = document.querySelectorAll('.my-content-ws-cb:checked');
        var allowed = new Set();
        cbs.forEach(function (cb) {
            var v = String(cb.value || '').trim();
            if (v) allowed.add(v);
        });
        if (allowed.size === 0) return rows;
        return rows.filter(function (row) {
            return allowed.has(String(row[idKey] != null ? row[idKey] : '').trim());
        });
    }

    function switchMyContentSubtab(name) {
        var subtabBtns = document.querySelectorAll('.my-content-subtab');
        var panelAct = document.getElementById('my-content-panel-activities');
        var panelOff = document.getElementById('my-content-panel-offers');
        subtabBtns.forEach(function (btn) {
            var on = btn.getAttribute('data-my-subtab') === name;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        var showAct = name === 'activities';
        if (panelAct) {
            panelAct.classList.toggle('is-hidden', !showAct);
            panelAct.hidden = !showAct;
        }
        if (panelOff) {
            panelOff.classList.toggle('is-hidden', showAct);
            panelOff.hidden = showAct;
        }
    }

    var activitiesHeader = '<div class="content-list-item content-list-item-ws content-list-header">' +
        '<span class="content-list-check"><input type="checkbox" id="activitySelectAll" aria-label="Select all"></span>' +
        '<span class="content-list-ws">Workspace</span>' +
        '<span class="content-list-id">ID</span>' +
        '<span class="content-list-name">Name</span>' +
        '<span class="content-list-type">Type</span>' +
        '<span class="content-list-meta">State · Pri · Updated</span>' +
        '<span class="content-list-via">Source</span>' +
        '<span class="content-list-actions">Actions</span>' +
        '</div>';
    var lastActivities = [];

    function applyActivityFilter() {
        var q = (document.getElementById('activityNameFilter') && document.getElementById('activityNameFilter').value) || '';
        var term = q.trim().toLowerCase();
        var list = term
            ? lastActivities.filter(function (a) {
                var name = (a.name != null ? String(a.name) : '');
                var idStr = String(a.id != null ? a.id : (a.activityId != null ? a.activityId : ''));
                return name.toLowerCase().indexOf(term) !== -1 || idStr.toLowerCase().indexOf(term) !== -1;
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

    /**
     * @param {string} [savedSummary] — 저장 직후 호출 시: 이 문구를 유지한 채 목록 갱신 결과와 함께 표시
     */
    function loadActivities(savedSummary) {
        var wsQ = buildMyContentWorkspaceQueryParam();
        if (!wsQ) {
            showActivitiesStatus('Select at least one workspace.', 'error');
            showStatus('Select one or more workspaces in My Content.', 'error');
            return;
        }
        showStatus('Loading Activities...', 'loading');
        showActivitiesStatus('Loading...', 'loading');
        if (myActivitiesList) myActivitiesList.innerHTML = '<p class="content-list-empty">Loading…</p>';

        fetchJson(API_BASE + '/activities/list?' + wsQ).then(function (r) {
            var actRes = r.data || {};
            if (r.ok && actRes.activities && Array.isArray(actRes.activities)) {
                lastActivities = filterListByCheckedWorkspaces(actRes.activities, 'workspaceId');
                applyActivityFilter();
                if (savedSummary && typeof savedSummary === 'string' && savedSummary.trim()) {
                    showActivitiesStatus(savedSummary.trim() + ' — list updated (' + lastActivities.length + ' items)', 'success');
                    showStatus('List refreshed after save.', 'success');
                } else {
                    showActivitiesStatus('Activities: ' + lastActivities.length + ' loaded', 'success');
                    showStatus('Activities loaded.', 'success');
                }
            } else {
                lastActivities = [];
                var actErr = actRes.error || 'Failed to load activities.';
                if (myActivitiesList) myActivitiesList.innerHTML = '<p class="content-list-empty">Activities error: ' + escapeHtml(String(actErr)) + '</p>';
                showActivitiesStatus('Activities error: ' + actErr, 'error');
                showStatus('Activities load failed.', 'error');
            }
        }).catch(function (err) {
            var msg = err.message || 'Request failed';
            showStatus('Error: ' + msg, 'error');
            showActivitiesStatus('Error: ' + msg + ' (check login session and .env)', 'error');
            lastActivities = [];
            if (myActivitiesList) myActivitiesList.innerHTML = '<p class="content-list-empty">Error loading. ' + escapeHtml(String(msg)) + '</p>';
        });
    }

    function loadOffers() {
        var wsQ = buildMyContentWorkspaceQueryParam();
        if (!wsQ) {
            showOffersStatus('Select at least one workspace.', 'error');
            showStatus('Select one or more workspaces in My Content.', 'error');
            return;
        }
        showStatus('Loading Offers...', 'loading');
        showOffersStatus('Loading...', 'loading');
        if (myOffersList) myOffersList.innerHTML = '<p class="content-list-empty">Loading…</p>';
        clearOffersBatchResult();

        fetchJson(API_BASE + '/offers/list?' + wsQ).then(function (r) {
            var offRes = r.data || {};
            if (r.ok && offRes.offers && Array.isArray(offRes.offers)) {
                var offersScoped = filterListByCheckedWorkspaces(offRes.offers, 'workspaceId');
                if (myOffersList) {
                    myOffersList.innerHTML = offersScoped.length === 0
                        ? '<p class="content-list-empty">No offers.</p>'
                        : offersHeader + offersScoped.map(renderOfferRow).join('');
                }
                showOffersStatus('Offers: ' + offersScoped.length + ' loaded', 'success');
                showStatus('Offers loaded.', 'success');
                updateOfferToolbar();
            } else {
                var offErr = offRes.error || 'Failed to load offers.';
                if (myOffersList) myOffersList.innerHTML = '<p class="content-list-empty">Offers error: ' + escapeHtml(String(offErr)) + '</p>';
                showOffersStatus('Offers error: ' + offErr, 'error');
                showStatus('Offers load failed.', 'error');
            }
        }).catch(function (err) {
            var msg = err.message || 'Request failed';
            showStatus('Error: ' + msg, 'error');
            showOffersStatus('Error: ' + msg, 'error');
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
        if (editBtn) editBtn.setAttribute('aria-label', ids.length ? ('Edit selected (' + ids.length + ')') : 'Edit selected (select rows first)');
        if (deleteBtn) deleteBtn.setAttribute('aria-label', ids.length ? ('Delete selected (' + ids.length + ')') : 'Delete selected (select rows first)');
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
            showOffersStatus('Enter HTML content.', 'error');
            return;
        }

        var ids;
        try { ids = JSON.parse(document.getElementById('offerEditIds').value || '[]'); } catch (e) { ids = []; }
        if (!Array.isArray(ids) || ids.length === 0) ids = [offerId];

        var applyNameCb = document.getElementById('offerEditApplyName');
        var applyName = !!(applyNameCb && applyNameCb.checked);

        offerEditSaveBtn.disabled = true;
        showOffersStatus('Saving… (' + ids.length + ' offers)', 'loading');
        clearOffersBatchResult();
        setOffersBatchResult('Updating offers…', ids.map(function (id0) {
            return { type: 'loading', text: 'ID ' + id0 + ' — starting (content' + (applyName ? ', name' : '') + ')' };
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
                    var summary = successCount + ' updated.' + (failCount ? (' ' + failCount + ' failed.') : '');
                    showOffersStatus(summary, failCount ? 'error' : 'success');
                    var lines = results.map(function (r0) {
                        if (r0.ok) return { type: 'success', text: 'ID ' + r0.id + ' — OK (content' + (applyName ? ', name' : '') + ')' };
                        return { type: 'error', text: 'ID ' + r0.id + ' — failed: ' + (r0.message || 'Unknown error') };
                    });
                    lines.push({ type: failCount ? 'error' : 'success', text: 'Summary: ' + summary });
                    setOffersBatchResult('Offer update results', lines, failCount ? 'error' : 'success');
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
        if (editBtn) { editBtn.disabled = false; editBtn.setAttribute('aria-label', ids.length ? ('Edit selected (' + ids.length + ')') : 'Edit selected (select rows first)'); }
        if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.setAttribute('aria-label', ids.length ? ('Delete selected (' + ids.length + ')') : 'Delete selected (select rows first)'); }
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
                    showStatus('Remove failed: ' + (err.message || 'Request failed'), 'error');
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
            var priorityEl = document.getElementById('activityEditPriority');
            if (priorityEl) {
                var pr = act.priority;
                priorityEl.value = (pr != null && pr !== '' && !isNaN(Number(pr))) ? String(Math.round(Number(pr))) : '5';
            }
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
    function formatActivitySaveApiError(data, httpStatus) {
        if (!data || typeof data !== 'object') return 'HTTP ' + (httpStatus || '');
        return data.error || data.message || (data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + (httpStatus || ''));
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
        var priorityInput = document.getElementById('activityEditPriority');
        var priorityBody = {};
        if (priorityInput && priorityInput.value.trim() !== '') {
            var prNum = Number(priorityInput.value);
            if (isNaN(prNum)) {
                showActivitiesStatus('Priority must be a number between 0 and 999.', 'error');
                activityEditSaveBtn.disabled = false;
                return;
            }
            priorityBody.priority = prNum;
        }
        var hasOptions = options.length > 0;
        var hasPriority = Object.prototype.hasOwnProperty.call(priorityBody, 'priority');
        var optionsPromise = (hasOptions || hasPriority)
            ? fetchJson(API_BASE + '/activities/' + encodeURIComponent(activityId) + '/options' + typeQs, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ options: options }, priorityBody))
            })
            : Promise.resolve({ ok: true, skipped: true, data: {} });
        Promise.all([statePromise, optionsPromise]).then(function (results) {
            var stateR = results[0];
            var optR = results[1];
            var errs = [];
            if (!stateR.ok) errs.push('State: ' + formatActivitySaveApiError(stateR.data, stateR.status));
            if (!optR.skipped && !optR.ok) errs.push('Offer/Priority: ' + formatActivitySaveApiError(optR.data, optR.status));
            if (errs.length) {
                showActivitiesStatus('Save failed — ' + errs.join(' · '), 'error');
                showStatus(errs.join(' · '), 'error');
                return;
            }
            var detail = [];
            if (optR.data && optR.data.priority != null && optR.data.priority !== '') {
                detail.push('Priority: ' + optR.data.priority);
            } else if (!optR.skipped && hasPriority) {
                detail.push('Priority save sent (no priority in response — check P: in list)');
            }
            var okMsg = 'Saved' + (detail.length ? ' · ' + detail.join(' · ') : '');
            closeEditModal();
            loadActivities(okMsg);
        }).catch(function (err) {
            showActivitiesStatus('Save failed: ' + (err.message || 'Request failed'), 'error');
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
                showActivitiesStatus('Select one or more activities, then click Edit selected.', 'error');
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
                showActivitiesStatus('Select one or more activities, then click Delete selected.', 'error');
                return;
            }
            var msg = 'Delete ' + ids.length + ' selected activit' + (ids.length === 1 ? 'y' : 'ies') + ' in Adobe?\nThis cannot be undone.';
            if (!window.confirm(msg)) return;
            showActivitiesStatus('Deleting…', 'loading');
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
                                    lines.push('ID ' + r.id + ': deleted. Response: ' + JSON.stringify(r.data));
                                } else {
                                    lines.push('ID ' + r.id + ': failed — ' + r.message);
                                }
                            });
                            var summary = successCount + ' deleted.';
                            if (failCount) summary += ' ' + failCount + ' failed.';
                            showActivitiesStatus(summary + '\n' + lines.join('\n'), failCount ? 'error' : 'success');
                        }
                    });
            });
        });
    }
    document.querySelectorAll('.my-content-subtab').forEach(function (btn) {
        btn.addEventListener('click', function () {
            switchMyContentSubtab(btn.getAttribute('data-my-subtab'));
        });
    });
    if (myContentLoadActivitiesBtn) {
        myContentLoadActivitiesBtn.addEventListener('click', function () {
            switchMyContentSubtab('activities');
            loadActivities();
        });
    }
    if (myContentLoadOffersBtn) {
        myContentLoadOffersBtn.addEventListener('click', function () {
            switchMyContentSubtab('offers');
            loadOffers();
        });
    }

    // Offers: select all + toolbar + edit/delete
    var offerEditBtnEl = document.getElementById('offerEditBtn');
    var offerDeleteBtnEl = document.getElementById('offerDeleteBtn');
    if (offerEditBtnEl) {
        offerEditBtnEl.addEventListener('click', function () {
            var ids = getSelectedOfferIds();
            if (ids.length === 0) { showOffersStatus('Select one or more offers, then click Edit selected.', 'error'); return; }
            var firstId = ids[0];
            var row = myOffersList && myOffersList.querySelector('.content-list-item[data-offer-id="' + firstId + '"]');
            var wsId = row ? row.getAttribute('data-workspace-id') : '';
            openOfferEditModal(ids, wsId);
        });
    }
    if (offerDeleteBtnEl) {
        offerDeleteBtnEl.addEventListener('click', function () {
            var ids = getSelectedOfferIds();
            if (ids.length === 0) { showOffersStatus('Select one or more offers, then click Delete selected.', 'error'); return; }
            var msg = 'Delete ' + ids.length + ' selected offer' + (ids.length === 1 ? '' : 's') + ' in Adobe?\nThis cannot be undone.';
            if (!window.confirm(msg)) return;
            showOffersStatus('Deleting…', 'loading');
            clearOffersBatchResult();
            setOffersBatchResult('Deleting offers…', ids.map(function (id0) {
                return { type: 'loading', text: 'ID ' + id0 + ' — starting' };
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
                            var summary = successCount + ' deleted.' + (failCount ? (' ' + failCount + ' failed.') : '');
                            showOffersStatus(summary, failCount ? 'error' : 'success');
                            var lines = results.map(function (r0) {
                                if (r0.ok) return { type: 'success', text: 'ID ' + r0.id + ' — deleted' };
                                return { type: 'error', text: 'ID ' + r0.id + ' — failed: ' + (r0.message || 'Unknown error') };
                            });
                            lines.push({ type: failCount ? 'error' : 'success', text: 'Summary: ' + summary });
                            setOffersBatchResult('Offer delete results', lines, failCount ? 'error' : 'success');
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
