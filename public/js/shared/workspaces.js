/**
 * Shared workspace helpers (Create + My Content)
 * - Keeps workspace selection logic consistent across features
 */
(function () {
    function getCheckedValues(selector) {
        var cbs = document.querySelectorAll(selector);
        var ids = [];
        cbs.forEach(function (cb) {
            var v = String(cb && cb.value != null ? cb.value : '').trim();
            if (v) ids.push(v);
        });
        return ids;
    }

    /** Workspaces selected in Create tab (checkboxes) */
    function getSelectedWorkspaceIds() {
        return getCheckedValues('.workspace-cb:checked');
    }

    /** Workspaces selected in My Content tab (checkboxes) */
    function getSelectedMyContentWorkspaceIds() {
        return getCheckedValues('.my-content-ws-cb:checked');
    }

    /** @returns {string|null} query string like "workspaceIds=1,2,3" */
    function buildWorkspaceIdsQueryParamFromIds(ids) {
        if (!ids || !ids.length) return null;
        var p = new URLSearchParams();
        p.set('workspaceIds', ids.join(','));
        return p.toString();
    }

    /** @returns {string|null} query string like "workspaceIds=..." for My Content */
    function buildMyContentWorkspaceQueryParam() {
        var ids = getSelectedMyContentWorkspaceIds();
        return buildWorkspaceIdsQueryParamFromIds(ids);
    }

    window.Workspaces = window.Workspaces || {};
    window.Workspaces.getSelectedWorkspaceIds = getSelectedWorkspaceIds;
    window.Workspaces.getSelectedMyContentWorkspaceIds = getSelectedMyContentWorkspaceIds;
    window.Workspaces.buildWorkspaceIdsQueryParamFromIds = buildWorkspaceIdsQueryParamFromIds;
    window.Workspaces.buildMyContentWorkspaceQueryParam = buildMyContentWorkspaceQueryParam;
})();

