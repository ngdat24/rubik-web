import {t} from './i18n.js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {accessUrl,accountLoginEnabled,createAuthClient,remindAccountUpgrade} from './auth-client.js';

export interface CloudAccount {id:string;token:()=>Promise<string>;client:SupabaseClient;dispose:()=>void}

/** Names are labels; only the browser's private session owns its records. */
export async function browserAccount(create=true):Promise<CloudAccount|undefined>{
  const client=await createAuthClient();
  if(!client)return;
  let {data:{session},error}=await client.auth.getSession();
  if(error)throw error;
  // Keep existing sessions, profiles and history during the transition.
  if(!session&&(!create||accountLoginEnabled))return;
  if(!session){
    const result=await client.auth.signInAnonymously();
    if(result.error)throw new Error(t("Chưa tạo được hồ sơ tự động. Kiểm tra mạng và bật Anonymous Sign-Ins trong Supabase."));
    session=result.data.session;
  }
  if(!session)throw new Error(t("Không lưu được hồ sơ trên trình duyệt này."));
  const id=session.user.id;
  const upgrade=new AbortController();
  void remindAccountUpgrade(client,session,upgrade.signal).catch(()=>{});
  const changed=client.auth.onAuthStateChange((event,next)=>{
    if((event==='SIGNED_OUT'||event==='SIGNED_IN')&&next?.user.id!==id)window.setTimeout(()=>location.reload(),0);
  });
  return {id,client,dispose:()=>{upgrade.abort();changed.data.subscription.unsubscribe();},token:async()=>{
    const {data:{session:current},error}=await client.auth.getSession();
    if(error||current?.user.id!==id)throw new Error(t("Phiên hồ sơ đã đổi hoặc hết hạn. Hãy tải lại trang."));
    return current.access_token;
  }};
}

export async function mountAccount():Promise<CloudAccount|undefined>{
  const account=await browserAccount();
  const open=document.querySelector<HTMLButtonElement>('#account-open')!;
  if(!account){
    open.hidden=!accountLoginEnabled;
    if(accountLoginEnabled){open.textContent=t('Đăng nhập');open.onclick=()=>location.assign(accessUrl());}
    return;
  }
  open.hidden=false;open.textContent=t("Hồ sơ");
  const dialog=document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const message=document.querySelector<HTMLElement>('#account-message')!;
  const remove=document.querySelector<HTMLButtonElement>('#account-delete')!;
  const confirmation=document.querySelector<HTMLInputElement>('#account-delete-confirm')!;
  const show=()=>{if(!document.querySelector('dialog[open]'))dialog.showModal();};
  const hide=()=>dialog.close();
  const rename=()=>{hide();document.querySelector<HTMLButtonElement>('#player-edit')!.click();};
  const deleteAccount=async()=>{
    if(confirmation.value!==t('XÓA')){message.textContent=t("Nhập XÓA để xác nhận xóa hồ sơ và dữ liệu trên server.");return;}
    remove.disabled=true;
    try{
      const response=await fetch('/api/account',{method:'DELETE',headers:{Authorization:'Bearer '+await account.token()}});
      if(!response.ok)throw new Error((await response.json()).error);
      await account.client.auth.signOut({scope:'local'});location.reload();
    }catch(error){message.textContent=error instanceof Error?t(error.message):t("Không xóa được hồ sơ.");remove.disabled=false;}
  };
  const close=document.querySelector('#account-close')!,edit=document.querySelector('#account-rename')!;
  if(accountLoginEnabled){
    document.querySelector<HTMLElement>('#account-legacy-note')!.hidden=true;
    const settings=document.querySelector<HTMLAnchorElement>('#account-credentials')!;
    settings.hidden=false;settings.href=accessUrl('link');
  }
  open.addEventListener('click',show);close.addEventListener('click',hide);edit.addEventListener('click',rename);remove.addEventListener('click',deleteAccount);
  const dispose=()=>{account.dispose();open.removeEventListener('click',show);close.removeEventListener('click',hide);edit.removeEventListener('click',rename);remove.removeEventListener('click',deleteAccount);dialog.close();};
  return {...account,dispose};
}
