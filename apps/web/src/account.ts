import type {SupabaseClient} from '@supabase/supabase-js';

export interface CloudAccount {id:string;token:()=>Promise<string>;client:SupabaseClient;dispose:()=>void}

/** Names are labels; only the browser's private session owns its records. */
export async function browserAccount():Promise<CloudAccount|undefined>{
  const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  if(!url||!key)return;
  const {createClient}=await import('@supabase/supabase-js');
  const client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let {data:{session},error}=await client.auth.getSession();
  if(error)throw error;
  // Keep existing sessions, profiles and history during the transition.
  if(!session){
    const result=await client.auth.signInAnonymously();
    if(result.error)throw new Error('Chưa tạo được hồ sơ tự động. Kiểm tra mạng và bật Anonymous Sign-Ins trong Supabase.');
    session=result.data.session;
  }
  if(!session)throw new Error('Không lưu được hồ sơ trên trình duyệt này.');
  const id=session.user.id;
  const changed=client.auth.onAuthStateChange((event,next)=>{
    if((event==='SIGNED_OUT'||event==='SIGNED_IN')&&next?.user.id!==id)window.setTimeout(()=>location.reload(),0);
  });
  return {id,client,dispose:()=>changed.data.subscription.unsubscribe(),token:async()=>{
    const {data:{session:current},error}=await client.auth.getSession();
    if(error||current?.user.id!==id)throw new Error('Phiên hồ sơ đã đổi hoặc hết hạn. Hãy tải lại trang.');
    return current.access_token;
  }};
}

export async function mountAccount():Promise<CloudAccount|undefined>{
  const account=await browserAccount();
  const open=document.querySelector<HTMLButtonElement>('#account-open')!;
  if(!account){open.hidden=true;return;}
  open.hidden=false;open.textContent='Hồ sơ';
  const dialog=document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const message=document.querySelector<HTMLElement>('#account-message')!;
  const remove=document.querySelector<HTMLButtonElement>('#account-delete')!;
  const confirmation=document.querySelector<HTMLInputElement>('#account-delete-confirm')!;
  const show=()=>{if(!document.querySelector('dialog[open]'))dialog.showModal();};
  const hide=()=>dialog.close();
  const rename=()=>{hide();document.querySelector<HTMLButtonElement>('#player-edit')!.click();};
  const deleteAccount=async()=>{
    if(confirmation.value!=='XÓA'){message.textContent='Nhập XÓA để xác nhận xóa hồ sơ và dữ liệu trên server.';return;}
    remove.disabled=true;
    try{
      const response=await fetch('/api/account',{method:'DELETE',headers:{Authorization:'Bearer '+await account.token()}});
      if(!response.ok)throw new Error((await response.json()).error);
      await account.client.auth.signOut({scope:'local'});location.reload();
    }catch(error){message.textContent=error instanceof Error?error.message:'Không xóa được hồ sơ.';remove.disabled=false;}
  };
  const close=document.querySelector('#account-close')!,edit=document.querySelector('#account-rename')!;
  open.addEventListener('click',show);close.addEventListener('click',hide);edit.addEventListener('click',rename);remove.addEventListener('click',deleteAccount);
  const dispose=()=>{account.dispose();open.removeEventListener('click',show);close.removeEventListener('click',hide);edit.removeEventListener('click',rename);remove.removeEventListener('click',deleteAccount);dialog.close();};
  return {...account,dispose};
}
