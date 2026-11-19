import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';

export function normalizeLoginName(value) {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,30}$/.test(name) ? name : undefined;
}

async function readCredentials(req) {
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += Buffer.byteLength(chunk);
      if (length > 2048) return undefined;
      chunks.push(Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > 2048) return undefined;
    try { raw = JSON.parse(raw); } catch { return undefined; }
  }
  const name = normalizeLoginName(raw?.name);
  const password = raw?.password;
  if (!name || typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password) > 256) return undefined;
  return {name, password};
}

export async function signInByLoginName(req, {env, request, fetcher, send}) {
  const invalid = () => send(401, {error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
  if (req.method !== 'POST') return send(405, {error:'Phương thức không hợp lệ.'});
  const credentials = await readCredentials(req);
  if (!credentials) return invalid();
  const forwarded = env.VERCEL === '1' && typeof req.headers['x-vercel-forwarded-for'] === 'string'
    ? req.headers['x-vercel-forwarded-for'].split(',')[0].trim() : '';
  const ip = isIP(forwarded) ? forwarded : req.socket?.remoteAddress ?? 'unknown';
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  const digest = (label, value) => createHmac('sha256', secret).update(label + ':' + value).digest('hex');
  const allowed = await request('/rest/v1/rpc/consume_account_login_quota', {method:'POST', body:{
    p_ip:digest('ip',ip), p_name:digest('account',credentials.name),
  }});
  if (!allowed) return send(429, {error:'Thử đăng nhập quá nhiều lần. Hãy thử lại sau.'});
  const email = await request('/rest/v1/rpc/account_login_email', {method:'POST',body:{p_name:credentials.name}});
  const response = await fetcher(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method:'POST',
    headers:{apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email:email ?? 'rubik-no-account@example.invalid',password:credentials.password}),
    signal:AbortSignal.timeout(10000),
  });
  if (response.status === 429) return send(429, {error:'Thử đăng nhập quá nhiều lần. Hãy thử lại sau.'});
  if (response.status >= 500) return send(503, {error:'Máy chủ đăng nhập tạm thời không phản hồi.'});
  if (!response.ok || !email) return invalid();
  const session = await response.json();
  if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') return invalid();
  return send(200, {access_token:session.access_token,refresh_token:session.refresh_token});
}
