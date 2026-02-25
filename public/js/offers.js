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
var workspaceSelect = document.getElementById('workspaceSelect');

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

async function searchOfferById() {
    if (!offerIdInput) return;
    var id = offerIdInput.value.trim();
    if (!id) { showStatus(tokenStatus, 'Enter an Offer ID and click Search.', 'error'); return; }
    var wsId = workspaceSelect ? workspaceSelect.value : '';
    if (!wsId) { showStatus(tokenStatus, 'Select a workspace first.', 'error'); return; }
    if (!accessToken) { showStatus(tokenStatus, 'Token not ready. Reload the page.', 'error'); return; }

    if (offerSearchBtn) offerSearchBtn.disabled = true;
    showStatus(tokenStatus, 'Searching...', 'loading');
    if (offerSearchResult) offerSearchResult.style.display = 'none';
    if (offerSearchEmpty) offerSearchEmpty.style.display = 'none';

    try {
        var url = API_BASE + '/offers/' + encodeURIComponent(id) + '?workspaceId=' + encodeURIComponent(wsId);
        var response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + accessToken, 'X-Tenant': tenant }
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Offer not found');

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
