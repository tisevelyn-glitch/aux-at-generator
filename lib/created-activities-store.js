/**
 * 현재 등록된 API(.env)로 이 앱에서 생성한 Activity ID만 저장/조회 (Supabase 테이블 public.created_activities)
 * → 목록 API에서 "내가 만든" 액티비티만 노출할 때 사용
 */
const { getSupabaseClient } = require('./supabase');

/**
 * 이 앱에서 Activity 생성 시 호출. 현재 API(tenant + clientId)로 생성된 ID 등록.
 */
async function addCreated(tenant, clientId, activityId) {
    if (!tenant || !clientId || activityId == null) return;
    var supabase = getSupabaseClient();
    if (!supabase) return;
    var { error } = await supabase.from('created_activities').upsert({
        tenant: tenant,
        client_id: clientId,
        activity_id: String(activityId),
        deleted_at: null
    }, { onConflict: 'tenant,client_id,activity_id' });
    if (error) console.warn('[created-activities-store] addCreated failed:', error.message);
}

/**
 * 현재 API(tenant + clientId)로 이 앱에서 생성한 Activity ID 집합 반환.
 */
async function getCreatedIdsForApi(tenant, clientId) {
    var supabase = getSupabaseClient();
    if (!supabase) return new Set();
    var { data, error } = await supabase
        .from('created_activities')
        .select('activity_id')
        .eq('tenant', tenant)
        .eq('client_id', clientId)
        .is('deleted_at', null);
    if (error) {
        console.warn('[created-activities-store] getCreatedIdsForApi failed:', error.message);
        return new Set();
    }
    var set = new Set();
    (data || []).forEach(function (e) { set.add(String(e.activity_id)); });
    return set;
}

/**
 * "내 목록"에서 제외 — row는 지우지 않고 deleted_at만 채운다(soft delete).
 */
async function removeFromCreated(tenant, clientId, activityId) {
    if (!tenant || !clientId || activityId == null) return;
    var supabase = getSupabaseClient();
    if (!supabase) return;
    var { error } = await supabase
        .from('created_activities')
        .update({ deleted_at: new Date().toISOString() })
        .eq('tenant', tenant)
        .eq('client_id', clientId)
        .eq('activity_id', String(activityId));
    if (error) console.warn('[created-activities-store] removeFromCreated failed:', error.message);
}

module.exports = {
    addCreated,
    getCreatedIdsForApi,
    removeFromCreated
};
