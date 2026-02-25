/**
 * Activity 생성 + 자동화 실행 로직
 */
var executeBtn = document.getElementById('executeBtn');

if (executeBtn) executeBtn.addEventListener('click', runAutomation);

async function runAutomation() {
    if (!accessToken) { showResult('Token not ready. Reload the page.\n', 'error'); return; }

    var wsSelect = document.getElementById('workspaceSelect');
    var wsId = wsSelect ? wsSelect.value : '';
    var selectedWorkspaceIds = wsId ? [wsId] : [];
    if (offerTypeSelect && offerTypeSelect.value === 'existing' && selectedOffer && selectedOffer.foundInWorkspace) {
        selectedWorkspaceIds = [selectedOffer.foundInWorkspace];
    }

    var activityName = document.getElementById('activityName').value.trim();
    var activityStatus = document.getElementById('activityStatus').value;
    var offerType = offerTypeSelect ? offerTypeSelect.value : 'create';

    if (!activityName) { showResult('Please enter an activity name.\n', 'error'); return; }
    if (selectedWorkspaceIds.length === 0) { showResult('Please select a workspace.\n', 'error'); return; }

    executeBtn.disabled = true;
    executeBtn.textContent = 'Running...';
    showResult('Starting automation...\n', 'loading');

    try {
        var offerId;

        // Step 1: Offer
        if (offerType === 'create') {
            var offerContent = document.getElementById('offerContent').value.trim();
            var offerName = document.getElementById('offerName').value.trim() || activityName + '_offer';
            if (!offerContent) throw new Error('Please enter HTML Offer content.');

            showResult('Step 1: Creating HTML Offer...\n', 'loading');
            var offerRes = await fetch(API_BASE + '/offers/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: offerName, content: offerContent, workspaceId: selectedWorkspaceIds[0] })
            });
            var offerData = await offerRes.json();
            if (!offerRes.ok) throw new Error(offerData.error || 'Failed to create offer');
            offerId = offerData.offerId;
            showResult('Offer created. Offer ID: ' + offerId + '\n', 'success');
        } else {
            offerId = selectedOfferId;
            if (!offerId) throw new Error('Please search by Offer ID and select an offer.');
            showResult('Using existing offer: ' + offerId + '\n', 'success');
        }

        // Step 2+3: Activity per workspace
        var results = [];
        for (var i = 0; i < selectedWorkspaceIds.length; i++) {
            var wId = selectedWorkspaceIds[i];
            var wLabel = getWorkspaceNameById(wId) || wId;

            showResult('Step 2: Creating A/B Test Activity for [' + wLabel + ']...\n', 'loading');
            var actRes = await fetch(API_BASE + '/activities/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: activityName, offerId: offerId, workspaceId: wId })
            });
            var actData = await actRes.json();
            if (!actRes.ok) throw new Error(actData.error || '[' + wLabel + '] Failed to create activity');
            var activityId = actData.activityId;
            showResult('[' + wLabel + '] Activity created. ID: ' + activityId + '\n', 'success');

            showResult('Step 3: Setting state to \'' + activityStatus + '\'...\n', 'loading');
            var stateRes = await fetch(API_BASE + '/activities/state', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activityId: activityId, state: activityStatus })
            });
            var stateData = await stateRes.json();
            if (!stateRes.ok) throw new Error(stateData.error || '[' + wLabel + '] Failed to update activity state');
            showResult('[' + wLabel + '] State updated.\n', 'success');
            results.push({ workspace: wLabel, activityId: activityId });
        }

        showResult('\n=== Done ===\n', 'success');
        showResult('Offer ID: ' + offerId + '\n', 'success');
        showResult('Activity: ' + activityName + '\n', 'success');
        showResult('State: ' + activityStatus + '\n', 'success');
        results.forEach(function (r) { showResult('  [' + r.workspace + '] Activity ID: ' + r.activityId + '\n', 'success'); });
    } catch (error) {
        showResult('\nError: ' + error.message + '\n', 'error');
    } finally {
        if (executeBtn) { executeBtn.disabled = false; executeBtn.textContent = 'Run automation'; }
    }
}
