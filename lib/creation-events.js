const { getDbPool } = require('./db');

function getAppEnv() {
  return (process.env.APP_ENV || process.env.NODE_ENV || 'prod').trim() || 'prod';
}

function getAppVersion() {
  return (process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || '').trim() || null;
}

async function insertCreationEvent(event) {
  const pool = getDbPool();
  if (!pool) return { ok: false, skipped: true, reason: 'no_db_url' };

  const payload = Object.assign({}, event, {
    app_env: event.app_env || getAppEnv(),
    app_version: event.app_version || getAppVersion()
  });

  const q = `
    insert into public.creation_events (
      app_env, app_version,
      tenant, client_id, workspace_id,
      resource_type, resource_id, activity_type, name,
      event_type, actor, status, error,
      creator_ims_user_id, creator_email,
      request_json, response_json,
      before_json, after_json
    ) values (
      $1,$2,
      $3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,$13,
      $14,$15,
      $16,$17,
      $18,$19
    )
    returning id
  `;

  const values = [
    payload.app_env,
    payload.app_version,
    payload.tenant,
    payload.client_id,
    payload.workspace_id,
    payload.resource_type,
    payload.resource_id,
    payload.activity_type || null,
    payload.name || null,
    payload.event_type || null,
    payload.actor || null,
    payload.status || null,
    payload.error || null,
    payload.creator_ims_user_id || null,
    payload.creator_email || null,
    payload.request_json != null ? payload.request_json : null,
    payload.response_json != null ? payload.response_json : null,
    payload.before_json != null ? payload.before_json : null,
    payload.after_json != null ? payload.after_json : null
  ];

  const r = await pool.query(q, values);
  const id = r && r.rows && r.rows[0] && r.rows[0].id;
  return { ok: true, id };
}

/**
 * My Content 등에서 단일 리소스의 감사 이벤트 조회 (tenant + client_id 스코프).
 * @param {{ tenant: string, clientId: string, resourceType: string, resourceId: string, limit?: number }} opts
 */
async function listCreationEvents(opts) {
  const pool = getDbPool();
  if (!pool) {
    return { db: false, events: [], message: 'no_db_url' };
  }
  var tenant = opts.tenant;
  var clientId = opts.clientId;
  var resourceType = String(opts.resourceType || '').trim().toLowerCase();
  var resourceId = String(opts.resourceId || '').trim();
  var limit = Number(opts.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  if (!tenant || !clientId || !resourceType || !resourceId) {
    return { db: true, events: [] };
  }
  var sql = `
    select id, created_at, app_env, app_version, event_type, actor, status, error,
           workspace_id, resource_type, resource_id, activity_type, name,
           request_json, response_json, before_json, after_json
    from public.creation_events
    where tenant = $1 and client_id = $2
      and resource_type = $3
      and resource_id::text = $4
    order by created_at desc nulls last
    limit $5
  `;
  var r = await pool.query(sql, [tenant, clientId, resourceType, resourceId, limit]);
  var rows = (r && r.rows) ? r.rows : [];
  return { db: true, events: rows };
}

module.exports = { insertCreationEvent, listCreationEvents };

