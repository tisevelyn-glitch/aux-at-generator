/**
 * Offer 검색 / 생성 UI 로직
 */
var offerTypeSelect = document.getElementById('offerType');
var offerCreateSection = document.getElementById('offerCreateSection');
var offerSelectSection = document.getElementById('offerSelectSection');
var offerIdInput = document.getElementById('offerIdInput');
var offerSearchBtn = document.getElementById('offerSearchBtn');
var offerSearchResult = document.getElementById('offerSearchResult');
var offerResultBody = document.getElementById('offerResultBody');
var offerSearchEmpty = document.getElementById('offerSearchEmpty');
var tokenStatus = document.getElementById('tokenStatus');
var offerCreateBtn = document.getElementById('offerCreateBtn');
var offerCreateResult = document.getElementById('offerCreateResult');
function getSelectedWorkspaceIds() {
    var cbs = document.querySelectorAll('.workspace-cb:checked');
    var ids = [];
    cbs.forEach(function (cb) { ids.push(cb.value); });
    return ids;
}

function getDefaultWorkspaceIdForUi() {
    if (typeof window !== 'undefined' && window.DEFAULT_WORKSPACE_ID) return String(window.DEFAULT_WORKSPACE_ID);
    if (typeof workspacesList !== 'undefined' && workspacesList[0] && workspacesList[0].id != null) {
        return String(workspacesList[0].id);
    }
    return '';
}

/** Target UI 스타일: HTML Offer, JSON Offer 등 */
function formatOfferTypeLabel(offer) {
    var raw = offer.contentType != null ? offer.contentType : offer.type;
    if (raw == null && offer.offerType != null) raw = offer.offerType;
    if (raw == null || raw === '') return '—';
    if (typeof raw === 'number') {
        if (raw === 1) return 'HTML Offer';
        if (raw === 2) return 'JSON Offer';
        return '— (' + raw + ')';
    }
    var s = String(raw).trim();
    if (/^html$/i.test(s)) return 'HTML Offer';
    if (/^json$/i.test(s)) return 'JSON Offer';
    if (/^redirect$/i.test(s)) return 'Redirect Offer';
    if (/^dynamic$/i.test(s)) return 'Dynamic Offer';
    if (/^xml$/i.test(s)) return 'XML Offer';
    return s;
}

function formatOfferDateTimeForUi(iso) {
    if (iso == null || iso === '') return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
        return d.toLocaleString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return String(iso);
    }
}

function formatOfferLastModifiedLine(offer) {
    var when = formatOfferDateTimeForUi(offer.modifiedAt || offer.updatedAt || offer.lastModified || offer.lastModifiedAt);
    var who = offer.modifiedBy || offer.lastModifiedBy;
    if (who && when && when !== '—') return when + ' by ' + who;
    if (when && when !== '—') return when;
    return '—';
}

var selectedOfferId = null;
var selectedOffer = null;

if (offerTypeSelect) {
    offerTypeSelect.addEventListener('change', function (e) {
        if (e.target.value === 'create') {
            if (offerCreateSection) offerCreateSection.style.display = 'block';
            if (offerSelectSection) offerSelectSection.style.display = 'none';
        } else {
            if (offerCreateSection) offerCreateSection.style.display = 'none';
            if (offerSelectSection) offerSelectSection.style.display = 'block';
            if (offerSearchResult) offerSearchResult.style.display = 'none';
            if (offerSearchEmpty) { offerSearchEmpty.style.display = 'block'; offerSearchEmpty.textContent = 'Enter an Offer ID and click Search.'; }
            selectedOfferId = null;
            selectedOffer = null;
        }
    });
}

if (offerSearchBtn) offerSearchBtn.addEventListener('click', searchOfferById);
if (offerIdInput) offerIdInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') searchOfferById(); });
if (offerCreateBtn) offerCreateBtn.addEventListener('click', createOffer);

async function searchOfferById() {
    if (!offerIdInput) return;
    var id = offerIdInput.value.trim();
    if (!id) { showStatus(tokenStatus, 'Enter an Offer ID and click Search.', 'error'); return; }
    var selectedWorkspaceIds = getSelectedWorkspaceIds();
    if (selectedWorkspaceIds.length === 0) { showStatus(tokenStatus, '워크스페이스를 먼저 선택하세요.', 'error'); return; }
    if (selectedWorkspaceIds.length !== 1) { showStatus(tokenStatus, 'Offer 검색/선택은 워크스페이스를 1개만 선택해 주세요.', 'error'); return; }
    var wsId = selectedWorkspaceIds[0];
    if (!accessToken) { showStatus(tokenStatus, 'Token not ready. Reload the page.', 'error'); return; }

    if (offerSearchBtn) offerSearchBtn.disabled = true;
    showStatus(tokenStatus, 'Searching...', 'loading');
    if (offerSearchResult) offerSearchResult.style.display = 'none';
    if (offerSearchEmpty) offerSearchEmpty.style.display = 'none';

    try {
        var url = API_BASE + '/offers/' + encodeURIComponent(id) + '?workspaceId=' + encodeURIComponent(wsId);
        var r = await fetchJson(url, {
            headers: { 'Authorization': 'Bearer ' + accessToken, 'X-Tenant': tenant }
        });
        var data = r.data;
        if (!r.ok) throw new Error(data.error || 'Offer not found');

        var offer = data.offer || data;
        selectedOfferId = String(offer.id != null && offer.id !== '' ? offer.id : (offer.offerId != null && offer.offerId !== '' ? offer.offerId : id)).trim();
        selectedOffer = offer;
        if (data.foundInWorkspace) {
            offer.foundInWorkspace = data.foundInWorkspace;
            offer.foundInWorkspaceName = getWorkspaceNameById(data.foundInWorkspace) || data.foundInWorkspace;
        }
        offer.searchRequestedWorkspaceId = wsId;
        offer.searchRequestedWorkspaceName = getWorkspaceNameById(wsId) || wsId;
        var defaultId = getDefaultWorkspaceIdForUi();
        var selectedIds = getSelectedWorkspaceIds();
        var defaultWorkspaceChecked = defaultId && selectedIds.some(function (sid) { return String(sid) === String(defaultId); });
        var actualId = data.foundInWorkspace;
        var actualInSelectedSet = actualId && selectedIds.some(function (sid) { return String(sid) === String(actualId); });
        offer.workspaceMismatchHighlight = selectedIds.length > 0 && !actualInSelectedSet && !defaultWorkspaceChecked;
        renderOfferResult(offer);
        if (offerSearchResult) { offerSearchResult.style.display = 'block'; offerSearchResult.classList.add('selected'); }
        var msg = 'Found offer: ' + (offer.name || selectedOfferId);
        if (offer.foundInWorkspaceName) msg += ' (오퍼 소속 WS: ' + offer.foundInWorkspaceName + ')';
        if (!actualInSelectedSet && defaultWorkspaceChecked && selectedIds.length > 0) {
            msg += ' — 오퍼 소속 WS가 현재 체크한 WS 목록에 없지만, Default WS가 선택되어 있어 Workspace는 검정으로 표시됩니다.';
        } else if (!actualInSelectedSet && selectedIds.length > 0) {
            msg += ' — 오퍼 소속 WS가 현재 체크한 워크스페이스에 포함되지 않습니다.';
        }
        showStatus(tokenStatus, msg, 'success');
    } catch (error) {
        showStatus(tokenStatus, 'Error: ' + error.message, 'error');
        if (offerSearchEmpty) { offerSearchEmpty.style.display = 'block'; offerSearchEmpty.textContent = error.message; }
    } finally {
        if (offerSearchBtn) offerSearchBtn.disabled = false;
    }
}

async function createOffer() {
    var selectedWorkspaceIds = getSelectedWorkspaceIds();
    if (selectedWorkspaceIds.length !== 1) {
        showStatus(tokenStatus, 'Offer 생성은 워크스페이스를 1개만 선택해 주세요.', 'error');
        return;
    }
    var wsId = selectedWorkspaceIds[0];
    if (!accessToken) { showStatus(tokenStatus, 'Token not ready. Reload the page.', 'error'); return; }

    var nameEl = document.getElementById('offerName');
    var contentEl = document.getElementById('offerContent');
    var name = nameEl ? nameEl.value.trim() : '';
    var content = contentEl ? contentEl.value.trim() : '';
    if (!name || !content) {
        showStatus(tokenStatus, 'Offer name과 HTML content를 입력하세요.', 'error');
        return;
    }

    if (offerCreateBtn) { offerCreateBtn.disabled = true; offerCreateBtn.textContent = 'Creating...'; }
    if (offerCreateResult) { offerCreateResult.style.display = 'none'; offerCreateResult.textContent = ''; }
    showStatus(tokenStatus, 'Creating offer...', 'loading');
    try {
        var r = await fetchJson(API_BASE + '/offers/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, content: content, workspaceId: wsId })
        });
        var data = r.data || {};
        if (!r.ok) throw new Error(data.error || 'Offer create failed');
        var offerId = String(data.offerId || (data.offer && (data.offer.id != null ? data.offer.id : data.offer.offerId)) || '').trim();
        if (!offerId) throw new Error('Offer created but offerId missing');

        // make it selectable immediately for activity mapping
        selectedOfferId = offerId;
        selectedOffer = data.offer || { id: offerId, name: name, content: content };
        selectedOffer.foundInWorkspace = wsId;
        selectedOffer.foundInWorkspaceName = getWorkspaceNameById(wsId) || wsId;
        renderOfferResult(selectedOffer);
        if (offerSearchResult) { offerSearchResult.style.display = 'block'; offerSearchResult.classList.add('selected'); }

        showStatus(tokenStatus, 'Offer created: ' + offerId + ' (in ' + (selectedOffer.foundInWorkspaceName || wsId) + ')', 'success');
        if (offerCreateResult) {
            offerCreateResult.style.display = 'block';
            offerCreateResult.className = 'status-message success';
            offerCreateResult.textContent = 'Created offerId: ' + offerId + ' (workspace: ' + (selectedOffer.foundInWorkspaceName || wsId) + ')';
        }
        try {
            if (typeof showResult === 'function') {
                showResult('[Offer 생성] workspace=' + (selectedOffer.foundInWorkspaceName || wsId) + ' offerId=' + offerId + '\n', 'success');
            }
        } catch (e) {}
    } catch (e) {
        showStatus(tokenStatus, 'Error: ' + e.message, 'error');
        if (offerCreateResult) {
            offerCreateResult.style.display = 'block';
            offerCreateResult.className = 'status-message error';
            offerCreateResult.textContent = e.message;
        }
        try {
            if (typeof showResult === 'function') showResult('[Offer 생성 실패] ' + (e.message || 'Request failed') + '\n', 'error');
        } catch (err2) {}
    } finally {
        if (offerCreateBtn) { offerCreateBtn.disabled = false; offerCreateBtn.textContent = 'Create Offer'; }
    }
}

function renderOfferResult(offer) {
    if (!offerResultBody) return;
    var name = offer.name != null ? offer.name : '';
    var offerIdDisplay = offer.id != null && offer.id !== '' ? String(offer.id) : (selectedOfferId || '—');
    var typeLabel = formatOfferTypeLabel(offer);
    var workspace = offer.foundInWorkspaceName
        || (offer.workspace && offer.workspace.name)
        || (offer.workspace && offer.workspace.id != null ? String(offer.workspace.id) : '')
        || '—';
    var lastModifiedLine = formatOfferLastModifiedLine(offer);
    var createdLine = '';
    var cAt = offer.createdAt || offer.created;
    var cBy = offer.createdBy || offer.author;
    if (cAt || cBy) {
        var cWhen = formatOfferDateTimeForUi(cAt);
        if (cBy && cWhen && cWhen !== '—') createdLine = cWhen + ' by ' + cBy;
        else if (cWhen && cWhen !== '—') createdLine = cWhen;
        else if (cBy) createdLine = String(cBy);
    }
    var wsValueClass = 'offer-workspace-value';
    if (offer.workspaceMismatchHighlight) wsValueClass += ' offer-workspace-mismatch';
    var rows =
        '<div class="offer-row"><span class="offer-label">Name</span><span>' + escapeHtml(String(name)) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Offer ID</span><span>' + escapeHtml(String(offerIdDisplay)) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Type</span><span>' + escapeHtml(typeLabel) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Workspace</span><span class="' + wsValueClass + '">' + escapeHtml(String(workspace)) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Last modified</span><span>' + escapeHtml(lastModifiedLine) + '</span></div>';
    if (createdLine) {
        rows += '<div class="offer-row"><span class="offer-label">Created</span><span>' + escapeHtml(createdLine) + '</span></div>';
    }
    if (offer.description) {
        rows += '<div class="offer-row"><span class="offer-label">Description</span><span>' + escapeHtml(String(offer.description)) + '</span></div>';
    }
    if (offer.status != null && String(offer.status).trim() !== '') {
        rows += '<div class="offer-row"><span class="offer-label">Status</span><span>' + escapeHtml(String(offer.status)) + '</span></div>';
    } else if (offer.state != null && String(offer.state).trim() !== '') {
        rows += '<div class="offer-row"><span class="offer-label">State</span><span>' + escapeHtml(String(offer.state)) + '</span></div>';
    }
    if (offer.workspaceMismatchHighlight && offer.searchRequestedWorkspaceName) {
        rows += '<div class="offer-row offer-row-note"><span class="offer-label">검색 시 선택</span><span class="offer-workspace-note">' + escapeHtml(String(offer.searchRequestedWorkspaceName)) + '</span></div>';
    }
    offerResultBody.innerHTML = rows;
}

if (offerSearchResult) {
    offerSearchResult.addEventListener('click', function () {
        if (selectedOfferId) offerSearchResult.classList.add('selected');
    });
}
