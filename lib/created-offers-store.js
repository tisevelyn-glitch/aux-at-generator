/**
 * 현재 등록된 API(.env)로 이 앱에서 생성한 Offer ID만 저장/조회 (Supabase 테이블 public.created_offers)
 * → 목록 API에서 "이 앱이 만든 Offer만" 노출할 때 사용
 */
const { getSupabaseClient } = require('./supabase');

async function addCreatedOffer(tenant, clientId, offerId, workspaceId) {
    if (!tenant || !clientId || offerId == null) return;
    var supabase = getSupabaseClient();
    if (!supabase) return;
    var ws = workspaceId != null && String(workspaceId).trim() ? String(workspaceId).trim() : null;
    var { error } = await supabase.from('created_offers').upsert({
        tenant: tenant,
        client_id: clientId,
        offer_id: String(offerId),
        workspace_id: ws,
        deleted_at: null
    }, { onConflict: 'tenant,client_id,offer_id' });
    if (error) console.warn('[created-offers-store] addCreatedOffer failed:', error.message);
}

async function listCreatedOffersForApi(tenant, clientId) {
    var supabase = getSupabaseClient();
    if (!supabase) return [];
    var { data, error } = await supabase
        .from('created_offers')
        .select('offer_id, workspace_id')
        .eq('tenant', tenant)
        .eq('client_id', clientId)
        .is('deleted_at', null);
    if (error) {
        console.warn('[created-offers-store] listCreatedOffersForApi failed:', error.message);
        return [];
    }
    return (data || []).map(function (e) {
        return { id: String(e.offer_id), workspaceId: e.workspace_id != null ? String(e.workspace_id) : null };
    });
}

async function getCreatedOfferIdsForApi(tenant, clientId) {
    var entries = await listCreatedOffersForApi(tenant, clientId);
    var set = new Set();
    entries.forEach(function (e) { set.add(String(e.id)); });
    return set;
}

async function getCreatedOfferMetaById(tenant, clientId, offerId) {
    if (!tenant || !clientId || offerId == null) return null;
    var supabase = getSupabaseClient();
    if (!supabase) return null;
    var { data, error } = await supabase
        .from('created_offers')
        .select('offer_id, workspace_id')
        .eq('tenant', tenant)
        .eq('client_id', clientId)
        .eq('offer_id', String(offerId))
        .is('deleted_at', null)
        .maybeSingle();
    if (error) {
        console.warn('[created-offers-store] getCreatedOfferMetaById failed:', error.message);
        return null;
    }
    if (!data) return null;
    return { id: String(data.offer_id), workspaceId: data.workspace_id != null ? String(data.workspace_id) : null };
}

/** row를 지우지 않고 deleted_at만 채워 삭제 이력을 남긴다(soft delete). */
async function removeFromCreatedOffers(tenant, clientId, offerId) {
    if (!tenant || !clientId || offerId == null) return;
    var supabase = getSupabaseClient();
    if (!supabase) return;
    var { error } = await supabase
        .from('created_offers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('tenant', tenant)
        .eq('client_id', clientId)
        .eq('offer_id', String(offerId));
    if (error) console.warn('[created-offers-store] removeFromCreatedOffers failed:', error.message);
}

module.exports = {
    addCreatedOffer,
    listCreatedOffersForApi,
    getCreatedOfferIdsForApi,
    getCreatedOfferMetaById,
    removeFromCreatedOffers
};
