import type {Session, SupabaseClient} from '@supabase/supabase-js';
import {language, t} from './i18n.js';

export const googleOnlyAccountLogin = import.meta.env.VITE_ACCOUNT_LOGIN_ENABLED === 'google-only';
export const accountLoginEnabled = import.meta.env.VITE_ACCOUNT_LOGIN_ENABLED === '1' || googleOnlyAccountLogin;

export function hasGoogleIdentity(user: Session['user']): boolean {
  return user.identities?.some(identity => identity.provider === 'google') ?? false;
}

export async function createAuthClient(): Promise<SupabaseClient | undefined> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const {createClient} = await import('@supabase/supabase-js');
  return createClient(url, key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});
}

export function accessUrl(mode = 'login'): string {
  const url = new URL('/account-access.html', location.origin);
  url.searchParams.set('mode',mode);
  url.searchParams.set('lang',language);
  return url.href;
}

export async function loginName(token: string, name?: string, signal?: AbortSignal): Promise<string | null> {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch('/api/login-name', {
    method: name === undefined ? 'GET' : 'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(name === undefined ? {} : {body:JSON.stringify({name})}),
    signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(t(body.error ?? 'Không thể lưu tên đăng nhập.'));
  }
  return (await response.json()).name;
}

export async function remindAccountUpgrade(session: Session, signal: AbortSignal): Promise<void> {
  if (!accountLoginEnabled) return;
  if (!session.user.is_anonymous) {
    if (googleOnlyAccountLogin ? hasGoogleIdentity(session.user) : await loginName(session.access_token, undefined, signal)) return;
  }
  if (signal.aborted) return;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby','upgrade-title');
  const title = document.createElement('h2');
  title.id = 'upgrade-title';
  title.textContent = t('Liên kết tài khoản Rubik Lab');
  const detail = document.createElement('p');
  detail.textContent = t(googleOnlyAccountLogin
    ? 'Liên kết Google để giữ quyền truy cập vào hồ sơ khi đổi thiết bị.'
    : 'Thêm email, mật khẩu và tên đăng nhập để giữ quyền truy cập vào hồ sơ khi đổi thiết bị.');
  const link = document.createElement('a');
  link.href = accessUrl('link');
  link.textContent = t('Liên kết ngay');
  const later = document.createElement('button');
  later.type = 'button';
  later.textContent = t('Để sau');
  later.onclick = () => dialog.close();
  dialog.append(title,detail,link,' ',later);
  document.body.append(dialog);
  const remove = () => {
    dialog.remove();
    signal.removeEventListener('abort',remove);
  };
  dialog.addEventListener('close',remove,{once:true});
  signal.addEventListener('abort',remove,{once:true});
  dialog.showModal();
}
