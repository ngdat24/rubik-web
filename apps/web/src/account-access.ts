import './style.css';
import './account-access.css';
import {language, t} from './i18n.js';
import {accessUrl, accountLoginEnabled, createAuthClient, googleOnlyAccountLogin, hasGoogleIdentity, loginName} from './auth-client.js';

const status = document.querySelector<HTMLElement>('#access-status')!;
const home = document.querySelector<HTMLAnchorElement>('#access-home')!;
const finishPassword = document.querySelector<HTMLFieldSetElement>('#finish-password')!;
const googleAttemptKey = 'rubik-google-auth-attempt';
const modes = ['login','signup','forgot','link','finish','recovery','linked'] as const;
type Mode = typeof modes[number];
const panel = (name:Mode) => document.getElementById(name)!;
const form = (name:Exclude<Mode,'linked'>) => panel(name) as HTMLFormElement;
const announce = (message:string) => {status.textContent=t(message);};
const show = (name:Mode) => {
  for (const mode of modes) panel(mode).hidden = mode !== name;
  if (panel(name) instanceof HTMLFormElement) panel(name).querySelector('input')?.focus();
};
home.href = '/?lang='+language;
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-mode]')) link.href=accessUrl(link.dataset.mode);

function bind(name:Exclude<Mode,'linked'>, submit:(fields:FormData)=>Promise<void>) {
  form(name).addEventListener('submit',async event=>{
    event.preventDefault();
    if(googleOnlyAccountLogin)return;
    const button=form(name).querySelector<HTMLButtonElement>('button[type=submit]')!;
    if(button.disabled)return;
    button.disabled=true;
    announce('');
    try {await submit(new FormData(form(name)));}
    catch(error) {announce(error instanceof Error?error.message:'Không thể hoàn tất thao tác. Hãy thử lại.');}
    finally {button.disabled=false;}
  });
}

function confirmedPassword(data:FormData): string {
  const password=String(data.get('password')??'');
  if(password!==data.get('confirmation'))throw new Error(t('Hai mật khẩu chưa trùng nhau.'));
  if(password.length<10||new TextEncoder().encode(password).length>72)
    throw new Error(t('Mật khẩu cần ít nhất 10 ký tự và tối đa 72 byte.'));
  return password;
}

async function boot(): Promise<void> {
  if(!accountLoginEnabled){announce('Đăng nhập bằng mật khẩu chưa được bật.');return;}
  if(googleOnlyAccountLogin){
    for(const element of document.querySelectorAll<HTMLElement>('[data-password-flow]'))element.hidden=true;
  }
  const mode=new URLSearchParams(location.search).get('mode')??'login';
  const emailCallback = new URLSearchParams(location.hash.slice(1));
  let callbackError = emailCallback.has('error') || new URLSearchParams(location.search).has('error');
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  const client=await createAuthClient();
  if(!client){announce('Đăng nhập bằng mật khẩu chưa được bật.');return;}
  let {data:{session}}=await client.auth.getSession();
  let recoveryUser:string|undefined;
  const googleCallback=mode==='google-sign-in'||mode==='google-link';
  const googleNonce=new URLSearchParams(location.search).get('attempt');
  const googleAttempt=googleCallback&&googleNonce?sessionStorage.getItem(googleAttemptKey):null;
  if(googleCallback)sessionStorage.removeItem(googleAttemptKey);
  const callbackTypes:Record<string,string>={link:'email_change','signup-confirmed':'signup',recovery:'recovery'};
  const accessToken=emailCallback.get('access_token');
  const refreshToken=emailCallback.get('refresh_token');
  if(accessToken||refreshToken){
    callbackError=true;
    const expectedEmailType=callbackTypes[mode];
    if(accessToken&&refreshToken&&(googleCallback||
      (expectedEmailType&&emailCallback.get('type')===expectedEmailType))){
      const {data:{user:verified}}=await client.auth.getUser(accessToken);
      const sameAccount=verified&&(!session||verified.id===session.user.id);
      const validGoogleIdentity=verified&&hasGoogleIdentity(verified);
      const expectedGoogleAccount=mode==='google-link'
        ? googleAttempt===googleNonce+':'+verified?.id&&session?.user.id===verified?.id
        : googleAttempt===googleNonce+':sign-in'&&!session;
      if(sameAccount&&(!googleCallback||(validGoogleIdentity&&expectedGoogleAccount))){
        const {data,error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
        if(!error&&data.session){
          session=data.session;
          callbackError=false;
          if(mode==='recovery')recoveryUser=verified.id;
        }
      }
    }
  }
  const {data:{user}}=session?await client.auth.getUser():{data:{user:null}};
  const confirmed=Boolean(user?.email_confirmed_at&&user.email&&!user.is_anonymous);
  const returnHome=()=>location.replace(home.href);
  const checkedSession=async()=>{
    const {data:{session:current},error}=await client.auth.getSession();
    if(error||!current||current.user.id!==user?.id)throw new Error(t('Phiên hồ sơ đã đổi hoặc hết hạn. Hãy tải lại trang.'));
    return current;
  };
  for(const linking of [false,true]){
    const button=document.querySelector<HTMLButtonElement>(linking?'#google-link':'#google-sign-in')!;
    button.onclick=async()=>{
      button.disabled=true;
      announce('');
      try{
        const current=linking?await checkedSession():null;
        if(linking&&!current?.user.is_anonymous)throw new Error();
        const nonce=crypto.randomUUID();
        const redirect=new URL(accessUrl(linking?'google-link':'google-sign-in'));
        redirect.searchParams.set('attempt',nonce);
        const options={redirectTo:redirect.href,skipBrowserRedirect:true};
        sessionStorage.setItem(googleAttemptKey,nonce+':'+(current?.user.id??'sign-in'));
        const {data,error}=linking
          ? await client.auth.linkIdentity({provider:'google',options})
          : await client.auth.signInWithOAuth({provider:'google',options});
        if(error||!data.url)throw new Error();
        location.assign(data.url);
      }catch{
        sessionStorage.removeItem(googleAttemptKey);
        announce('Không thể tiếp tục với Google. Hãy thử lại.');
        button.disabled=false;
      }
    };
  }

  bind('login',async fields=>{
    const response=await fetch('/api/session-login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:fields.get('name'),password:fields.get('password')}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok)throw new Error(t(result.error??'Không thể đăng nhập.'));
    const {error}=await client.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});
    if(error)throw new Error(t('Không thể đăng nhập.'));
    returnHome();
  });

  bind('signup',async fields=>{
    const name=String(fields.get('name')).trim().toLowerCase();
    const {error}=await client.auth.signUp({email:String(fields.get('email')).trim(),password:confirmedPassword(fields),
      options:{emailRedirectTo:accessUrl('signup-confirmed'),data:{rubik_signup_name:name}}});
    if(error&&error.status===429)throw new Error(t('Bạn đã gửi quá nhiều yêu cầu. Hãy thử lại sau.'));
    if(error&&error.code!=='user_already_exists'&&error.code!=='email_exists')throw new Error(t('Không gửi được email xác minh. Hãy thử lại.'));
    form('signup').reset();
    announce('Hãy kiểm tra email để xác minh. Nếu đã đăng ký trước đó, bạn có thể dùng Quên mật khẩu.');
  });

  bind('forgot',async fields=>{
    const {error}=await client.auth.resetPasswordForEmail(String(fields.get('email')).trim(),{redirectTo:accessUrl('recovery')});
    if(error?.status===429)throw new Error(t('Bạn đã gửi quá nhiều yêu cầu. Hãy thử lại sau.'));
    announce('Nếu email đã được liên kết, bạn sẽ nhận được liên kết đặt lại mật khẩu.');
  });

  bind('recovery',async fields=>{
    const current=await checkedSession();
    if(!recoveryUser||current.user.id!==recoveryUser)throw new Error(t('Hãy mở liên kết đặt lại từ email.'));
    const {error}=await client.auth.updateUser({password:confirmedPassword(fields)});
    if(error)throw new Error(t('Không thể lưu mật khẩu mới. Hãy yêu cầu liên kết mới.'));
    // No password or recovery token is stored by this page.
    const {error:signOutError}=await client.auth.signOut();
    if(signOutError){announce('Đã đổi mật khẩu nhưng chưa đăng xuất được.');return;}
    const loginUrl=new URL(accessUrl());
    loginUrl.searchParams.set('password','changed');
    location.replace(loginUrl.href);
  });

  bind('link',async fields=>{
    await checkedSession();
    if(!user?.is_anonymous)throw new Error(t('Hãy tải lại trang để tiếp tục liên kết.'));
    const {error}=await client.auth.updateUser({email:String(fields.get('email')).trim()},{emailRedirectTo:accessUrl('link')});
    if(error)throw new Error(t('Không thể gửi email liên kết. Kiểm tra email và thử lại.'));
    announce('Mở liên kết trong email để tiếp tục. Hồ sơ hiện tại vẫn dùng được trên thiết bị này.');
  });

  bind('finish',async fields=>{
    const current=await checkedSession();
    if(!confirmed)throw new Error(t('Hãy xác minh email trước khi hoàn tất.'));
    if(!finishPassword.disabled){
      const {error}=await client.auth.updateUser({password:confirmedPassword(fields)});
      if(error&&error.code!=='same_password')throw new Error(t('Không thể đặt mật khẩu. Hãy thử mật khẩu khác.'));
    }
    await loginName(current.access_token,String(fields.get('name')));
    returnHome();
  });

  const signOut=document.querySelector<HTMLButtonElement>('#sign-out')!;
  signOut.onclick=async()=>{
    signOut.disabled=true;
    const {error}=await client.auth.signOut({scope:'local'});
    if(error){announce('Không thể đăng xuất. Hãy thử lại.');signOut.disabled=false;}
    else location.replace(accessUrl());
  };

  announce('');
  if(googleCallback&&callbackError)announce('Không thể hoàn tất xác thực Google. Hãy thử lại.');
  if(googleOnlyAccountLogin){
    if(user?.is_anonymous){show('link');return;}
    if(user){
      if(googleCallback&&!callbackError&&hasGoogleIdentity(user)){returnHome();return;}
      show('linked');
      return;
    }
    show('login');
    return;
  }
  if(mode==='recovery'){
    if(recoveryUser&&user?.id===recoveryUser){show('recovery');return;}
    announce('Liên kết đặt lại đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.');
    show('forgot');
    return;
  }
  if(mode==='forgot'){show('forgot');return;}
  if(!session||!user){
    if(!googleCallback&&(callbackError||mode==='signup-confirmed'||mode==='link'))announce('Liên kết không tải được phiên. Hãy thử mở lại email hoặc đăng nhập.');
    else if(new URLSearchParams(location.search).get('password')==='changed')announce('Đã đổi mật khẩu. Hãy đăng nhập lại.');
    show(mode==='signup'?'signup':'login');
    return;
  }
  if(user.is_anonymous||!confirmed){
    if(callbackError&&!googleCallback)announce('Liên kết không còn hợp lệ. Bạn có thể gửi lại email xác minh.');
    show('link');
    return;
  }
  const existing=await loginName(session.access_token);
  if(existing){
    document.querySelector('#linked-name')!.textContent=t('Tên đăng nhập')+': '+existing;
    show('linked');
    return;
  }
  const signupName=user.user_metadata.rubik_signup_name;
  if(typeof signupName==='string')form('finish').querySelector<HTMLInputElement>('[name=name]')!.value=signupName;
  finishPassword.hidden=finishPassword.disabled=typeof signupName==='string';
  show('finish');
}

window.addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).has('access_token')) location.reload();
});
void boot().catch(()=>announce('Không thể kiểm tra tài khoản. Hãy tải lại trang.'));
