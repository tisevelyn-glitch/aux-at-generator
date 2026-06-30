const { createClient } = require('@supabase/supabase-js');

let _client = null;

/** service_role 키 사용 — 서버 전용, RLS 무시하고 바로 읽기/쓰기. .env 없으면 null. */
function getSupabaseClient() {
    if (_client) return _client;
    var url = (process.env.SUPABASE_URL || '').trim();
    var key = (process.env.SUPABASE_SECRET_KEY || '').trim();
    if (!url || !key) return null;
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
}

module.exports = { getSupabaseClient };
