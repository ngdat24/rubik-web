import type {Session,SupabaseClient} from '@supabase/supabase-js';

export interface CloudAccount {id:string;token:()=>Promise<string>;client:SupabaseClient;dispose:()=>void}
export async function mountAccount():Promise<CloudAccount|undefined>{
  const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  const open=document.querySelector<HTMLButtonElement>('#account-open')!;
  if(!url||!key){open.hidden=true;return;}
  open.hidden=false;
  const {createClient}=await import('@supabase/supabase-js');
  const client=createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const dialog=document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const form=document.querySelector<HTMLFormElement>('#account-form')!;
  const email=document.querySelector<HTMLInputElement>('#account-email')!,password=document.querySelector<HTMLInputElement>('#account-password')!;
  const message=document.querySelector<HTMLElement>('#account-message')!;
  const login=document.querySelector<HTMLElement>('#account-login')!,signed=document.querySelector<HTMLElement>('#account-signed')!;
  const close=document.querySelector('#account-close')!;
  const signout=document.querySelector('#account-signout')!;
  const remove=document.querySelector<HTMLButtonElement>('#account-delete')!;
  const confirmation=document.querySelector<HTMLInputElement>('#account-delete-confirm')!;
  const mode=document.querySelector<HTMLSelectElement>('#account-mode')!;
  let recovery=false,disposed=false,initialized=false;
  let session:Session|null=null,initialId:string|undefined;
  const render=()=>{open.textContent=initialId?'Tài khoản':'Đăng nhập';login.hidden=!!initialId&&!recovery;signed.hidden=!initialId||recovery;document.querySelector('#account-email-label')!.textContent=session?.user.email??'';};
  const show=()=>{if(!document.querySelector('dialog[open]'))dialog.showModal();};
  const changed=client.auth.onAuthStateChange((event,next)=>{
    if(disposed)return;
    if(event==='PASSWORD_RECOVERY')recovery=true;
    if(!initialized)return;
    if(event==='PASSWORD_RECOVERY'){password.value='';mode.value='password';password.required=true;email.required=false;render();show();}
    // Never await auth methods inside the auth event callback.
    if((event==='SIGNED_IN'||event==='SIGNED_OUT')&&(next?.user.id!==initialId))window.setTimeout(()=>location.reload(),0);
  });
  session=(await client.auth.getSession()).data.session;initialId=session?.user.id;initialized=true;
  if(recovery){mode.value='password';window.setTimeout(()=>{if(!disposed)show();},0);}
  const submit=async(event:SubmitEvent)=>{
    event.preventDefault();message.textContent='Đang xử lý…';const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;
    try{
      let result;
      if(mode.value==='password'){
        if(!recovery)throw new Error('Mở liên kết khôi phục trong email để đổi mật khẩu.');
        result=await client.auth.updateUser({password:password.value});if(!result.error){recovery=false;render();message.textContent='Đã đổi mật khẩu.';}
      }else if(mode.value==='signup'){
        result=await client.auth.signUp({email:email.value,password:password.value,options:{emailRedirectTo:location.origin+'/'}});
        if(!result.error){password.value='';message.textContent='Kiểm tra email để xác nhận tài khoản, rồi đăng nhập.';}
      }else if(mode.value==='reset'){
        result=await client.auth.resetPasswordForEmail(email.value,{redirectTo:location.origin+'/'});
        if(!result.error)message.textContent='Nếu địa chỉ hợp lệ, email khôi phục sẽ được gửi. Hãy mở trên trình duyệt này.';
      }else result=await client.auth.signInWithPassword({email:email.value,password:password.value});
      if(result.error)throw result.error;
    }catch(error){message.textContent=error instanceof Error?error.message:'Không đăng nhập được.';}
    finally{button.disabled=false;}
  };
  const changeMode=()=>{password.required=mode.value!=='reset';email.required=mode.value!=='password';password.autocomplete=mode.value==='signin'?'current-password':'new-password';};
  const logout=async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)message.textContent=error.message;};
  const deleteAccount=async()=>{
    if(confirmation.value!=='XÓA'){message.textContent='Nhập XÓA để xác nhận xóa tài khoản và dữ liệu trên server.';return;}
    remove.disabled=true;
    try{const {data:{session:current}}=await client.auth.getSession();const response=await fetch('/api/account',{method:'DELETE',headers:{Authorization:'Bearer '+current?.access_token}});if(!response.ok)throw new Error((await response.json()).error);await client.auth.signOut({scope:'local'});}
    catch(error){message.textContent=error instanceof Error?error.message:'Không xóa được tài khoản.';}finally{remove.disabled=false;}
  };
  const hide=()=>dialog.close();
  open.addEventListener('click',show);close.addEventListener('click',hide);form.addEventListener('submit',submit);mode.addEventListener('change',changeMode);signout.addEventListener('click',logout);remove.addEventListener('click',deleteAccount);render();changeMode();
  const dispose=()=>{disposed=true;changed.data.subscription.unsubscribe();open.removeEventListener('click',show);close.removeEventListener('click',hide);form.removeEventListener('submit',submit);mode.removeEventListener('change',changeMode);signout.removeEventListener('click',logout);remove.removeEventListener('click',deleteAccount);dialog.close();};
  // Guest mode must also dispose the SDK listener during HMR.
  if(!initialId){
    const onHide=(event:PageTransitionEvent)=>{if(!event.persisted)dispose();};
    window.addEventListener('pagehide',onHide);
    import.meta.hot?.dispose(()=>{window.removeEventListener('pagehide',onHide);dispose();});return;
  }
  return {id:initialId,client,dispose,token:async()=>{const {data:{session:current},error}=await client.auth.getSession();if(error||current?.user.id!==initialId)throw new Error('Hãy đăng nhập lại.');return current.access_token;}};
}
