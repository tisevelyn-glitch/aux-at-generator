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
        selectedOfferId = String(offer.id || offer.offerId || id);
        selectedOffer = offer;
        if (data.foundInWorkspace) {
            offer.foundInWorkspace = data.foundInWorkspace;
            offer.foundInWorkspaceName = getWorkspaceNameById(data.foundInWorkspace) || data.foundInWorkspace;
        }
        renderOfferResult(offer);
        if (offerSearchResult) { offerSearchResult.style.display = 'block'; offerSearchResult.classList.add('selected'); }
        var msg = 'Found offer: ' + (offer.name || selectedOfferId);
        if (offer.foundInWorkspaceName) msg += ' (in ' + offer.foundInWorkspaceName + ')';
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
        var offerId = String(data.offerId || (data.offer && (data.offer.id || data.offer.offerId)) || '');
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
    var type = offer.type || offer.contentType || '—';
    var workspace = (offer.workspace && offer.workspace.name) || '—';
    if (offer.foundInWorkspaceName) workspace = offer.foundInWorkspaceName;
    var updated = offer.updatedAt || offer.modifiedAt || offer.lastModified || '—';
    offerResultBody.innerHTML =
        '<div class="offer-row"><span class="offer-label">Name</span><span>' + escapeHtml(name) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Type</span><span>' + escapeHtml(String(type)) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Workspace</span><span>' + escapeHtml(String(workspace)) + '</span></div>' +
        '<div class="offer-row"><span class="offer-label">Last updated</span><span>' + escapeHtml(String(updated)) + '</span></div>';
}

if (offerSearchResult) {
    offerSearchResult.addEventListener('click', function () {
        if (selectedOfferId) offerSearchResult.classList.add('selected');
    });
}
