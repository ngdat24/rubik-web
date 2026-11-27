import './navigation.css';
export function mountNavigation(en:boolean){
 const header=document.querySelector('header');if(!header)return;
 const home=location.pathname==='/'||location.pathname.endsWith('/index.html');
 const board=location.pathname.endsWith('/leaderboard.html');
 const race=location.pathname.endsWith('/race.html'),solo=location.pathname.endsWith('/time-limit.html');
 const account=header.querySelector('#account-open'),shop=header.querySelector('#shop-open');
 header.classList.add('site-navigation');header.replaceChildren();
 header.innerHTML=`<a class="brand" href="/" aria-label="Rubik Lab"><span class="brand-cube" aria-hidden="true">▦</span>rubik<span class="brand-light">lab</span>.</a><nav class="site-links" aria-label="${en?'Navigation':'Điều hướng'}"><a class="nav-item" data-nav="home" href="/">${en?'Main':'Trang chủ'}</a><details class="nav-modes"><summary class="nav-item">Mode</summary><div class="mode-options"><a class="nav-item" href="/time-limit.html" ${solo?'aria-current="page"':''}>Time Limit</a><a class="nav-item" href="/race.html" ${race?'aria-current="page"':''}>${en?'1v1':'Đấu 1v1'}</a></div></details><a class="nav-item" data-nav="board" href="/leaderboard.html">${en?'Global leaderboard':'BXH Toàn Cầu'}</a><div class="fashion-nav"></div><span class="profile-nav"></span></nav><output id="economy-wallet" class="nav-wallet" aria-live="polite" hidden></output>`;
 const fashion=header.querySelector('.fashion-nav')!,profile=header.querySelector('.profile-nav')!;
 const shopLink=shop??Object.assign(document.createElement('a'),{href:'/?panel=shop'});
 const profileLink=account??Object.assign(document.createElement('a'),{href:'/?panel=profile'});
 shopLink.textContent=en?'Fashion':'Thời trang';profileLink.textContent=en?'Profile':'Hồ sơ';
 shopLink.classList.add('nav-item');profileLink.classList.add('nav-item');fashion.append(shopLink);profile.append(profileLink);
 const more=document.createElement('button');more.type='button';more.className='nav-more-toggle';
 more.setAttribute('aria-label',en?'Open profile menu':'Mở menu hồ sơ');more.setAttribute('aria-expanded','false');
 more.setAttribute('aria-controls','nav-profile-panel');more.innerHTML='<span aria-hidden="true">▾</span>';
 profile.id='nav-profile-panel';profile.before(more);
 const mobile=matchMedia('(max-width:850px)');
 const closeProfile=()=>{more.setAttribute('aria-expanded','false');profile.classList.remove('profile-open');};
 mobile.addEventListener('change',closeProfile);
 more.addEventListener('click',()=>{
  const open=more.getAttribute('aria-expanded')!=='true';
  more.setAttribute('aria-expanded',String(open));profile.classList.toggle('profile-open',open);
  header.querySelector<HTMLDetailsElement>('.nav-modes')!.open=false;
 });
 profileLink.addEventListener('click',closeProfile);
 const season=document.createElement('span');season.className='nav-season';season.textContent=en?'Season…':'Mùa giải…';fashion.append(season);
 const updateActive=()=>{
  const shopOpen=document.querySelector('#shop-dialog')?.hasAttribute('open'),profileOpen=document.querySelector('#account-dialog')?.hasAttribute('open');
  const currentHome=header.querySelector('[data-nav=home]')!;
  if(home&&!shopOpen&&!profileOpen)currentHome.setAttribute('aria-current','page');else currentHome.removeAttribute('aria-current');
  if(board)header.querySelector('[data-nav=board]')!.setAttribute('aria-current','page');
  shopLink.classList.toggle('nav-active',!!shopOpen);profileLink.classList.toggle('nav-active',!!profileOpen);
 };
 updateActive();if(race||solo)header.querySelector('.nav-modes')!.classList.add('nav-active');
 const observer=new MutationObserver(updateActive);for(const id of ['shop-dialog','account-dialog']){const d=document.getElementById(id);if(d)observer.observe(d,{attributes:true,attributeFilter:['open']});}
 const modes=header.querySelector<HTMLDetailsElement>('.nav-modes')!;
 document.addEventListener('click',e=>{if(e.target instanceof Node){if(!modes.contains(e.target))modes.open=false;if(!more.contains(e.target)&&!profile.contains(e.target))closeProfile();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.getAttribute('aria-expanded')==='true'){closeProfile();more.focus();}});
 modes.addEventListener('keydown',e=>{if(e.key==='Escape'){modes.open=false;modes.querySelector<HTMLElement>('summary')!.focus();}});
 const abort=new AbortController();
 async function refreshSeason(){try{
  const r=await fetch('/api/navigation-season',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])});if(!r.ok)throw new Error();
  const {endsAt}=await r.json();const remaining=Date.parse(endsAt)-Date.now();
  season.textContent=Number.isFinite(remaining)&&remaining>0?(en?`${Math.ceil(remaining/86400000)} days left`:`Còn ${Math.ceil(remaining/86400000)} ngày`):(en?'Season ended':'Đã hết mùa');
 }catch{if(!abort.signal.aborted)season.textContent=en?'Season unavailable':'Chưa tải được mùa';}}
 void refreshSeason();const timer=setInterval(()=>{if(!document.hidden)void refreshSeason();},60000);
 window.addEventListener('pagehide',event=>{abort.abort();clearInterval(timer);observer.disconnect();if(!event.persisted)mobile.removeEventListener('change',closeProfile);},{once:true});
}
