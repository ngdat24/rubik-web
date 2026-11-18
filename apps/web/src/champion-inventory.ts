import type {CloudAccount} from './account.js';
import {championAwards,ChampionRequestError} from './champion-account.js';
import type {ChampionAward} from './champion-account.js';
import type {ChampionSize} from './champion-design.js';
import {newId} from './id.js';
import {t} from './i18n.js';
import {championPreferenceKey} from './champion-equipped.js';

export function championInventory(account:CloudAccount|undefined,changed:()=>void,
  equip:(size:ChampionSize,award?:ChampionAward)=>Promise<void>,canChange:()=>boolean,transactionDone:()=>void) {
  let awards:ChampionAward[]=[],disposed=false,busy=false,error='';
  const selected=new Set<ChampionSize>();
  const pending=new Map<ChampionSize,{action:'rename';size:ChampionSize;name:string;requestId:string}>();
  const key=(size:ChampionSize)=>championPreferenceKey(account?.id,size);
  for(const size of [2,3] as const)try{if(localStorage.getItem(key(size))==='1')selected.add(size);}catch{/* Optional preference. */}
  const apply=async(size:ChampionSize,enabled:boolean)=>{
    const award=awards.find(row=>row.size===size);
    await equip(size,enabled?award:undefined);
    if(enabled)selected.add(size);else selected.delete(size);
    try{localStorage.setItem(key(size),enabled?'1':'0');}catch{/* Session preference remains active. */}
    changed();
  };
  return {
    isEquipped:(size:ChampionSize)=>selected.has(size),
    clear:(size:ChampionSize)=>apply(size,false),
    async refresh(){
      if(!account||disposed)return;
      try{
        const result=await championAwards(account);
        if(disposed)return;
        awards=result;error='';
        for(const size of [2,3] as const){
          if(selected.has(size))await apply(size,Boolean(awards.find(row=>row.size===size)?.variant));
        }
      }catch(failure){error=failure instanceof Error?t(failure.message):t('Không tải được quyền nhận Champion.');}
      if(!disposed)changed();
    },
    card(size:ChampionSize,preview:()=>void):HTMLElement|undefined {
      const award=awards.find(row=>row.size===size);
      if(!award)return;
      const card=document.createElement('article');card.className='shop-card champion-card';card.dataset.tier='gold';card.dataset.champion=String(size);
      const rarity=document.createElement('p');rarity.textContent=t('Huyền thoại');
      const heading=document.createElement('h3');heading.textContent=`Champion ${size}×${size}`;
      const name=document.createElement('p');name.className='champion-skin-name';name.textContent=award.name??t('Chưa đặt tên');
      const colors=document.createElement('div');colors.className='shop-swatches';colors.setAttribute('aria-hidden','true');
      for(const color of ['#ffffff','#ff1744','#00db70','#ffd700','#ff7900','#0096ff']){const swatch=document.createElement('span');swatch.style.backgroundColor=color;colors.append(swatch);}
      const action=(label:string,click:()=>void)=>{const button=document.createElement('button');button.type='button';button.textContent=t(label);button.disabled=busy;button.onclick=click;return button;};
      const equipButton=action(selected.has(size)?'Đang trang bị':'Trang bị',()=>{
        if(!canChange()){error=t('Chờ lượt giải kết thúc để đổi skin.');changed();return;}
        busy=true;changed();void (async()=>{
          if(!award.variant&&account){
            awards=await championAwards(account,{size,variant:'borderless',name:input.value.trim()||`Champion ${size}×${size}`});
          }
          if(!disposed)await apply(size,true);
        })().catch(failure=>{error=failure instanceof Error?t(failure.message):String(failure);}).finally(()=>{busy=false;if(!disposed)changed();});
      });
      equipButton.disabled=busy||selected.has(size);
      const form=document.createElement('form');form.className='champion-name-form';
      const label=document.createElement('label');label.textContent=t('Tên skin');
      const input=document.createElement('input');input.type='text';input.maxLength=32;input.required=Boolean(award.variant);input.value=pending.get(size)?.name??award.name??'';input.placeholder=`Champion ${size}×${size}`;input.disabled=busy||pending.has(size);label.append(input);
      const save=document.createElement('button');save.type='submit';save.textContent=t(pending.has(size)?'Thử lại giao dịch':award.variant?'Đổi tên · 500 CB':'Đặt tên & nhận');save.disabled=busy;
      const note=document.createElement('p');note.textContent=t(award.variant?'Đổi tên tốn 500 CB/lần.':'Tên trống dùng tên mặc định. Sau khi nhận, đổi tên tốn 500 CB.');
      const confirmation=document.createElement('div');confirmation.className='shop-confirmation';confirmation.hidden=true;
      const submit=async()=>{
        if(!account||busy)return;
        if(!canChange()){error=t('Chờ lượt giải kết thúc để đổi skin.');changed();return;}
        const choice=award.variant?(pending.get(size)??{action:'rename' as const,size,name:input.value.trim(),requestId:newId()}):{size,variant:'borderless' as const,name:input.value.trim()||`Champion ${size}×${size}`};
        if('requestId' in choice)pending.set(size,choice);
        busy=true;error='';changed();
        try{
          const result=await championAwards(account,choice);
          if(disposed)return;
          awards=result;pending.delete(size);
          if(selected.has(size))await apply(size,true);
          window.dispatchEvent(new Event('rubik-shop-updated'));transactionDone();
        }catch(failure){
          if(failure instanceof ChampionRequestError&&!failure.retry)pending.delete(size);
          error=failure instanceof Error?t(failure.message):t('Không lưu được lựa chọn. Hãy thử lại.');
        }finally{busy=false;if(!disposed)changed();}
      };
      form.onsubmit=event=>{
        event.preventDefault();
        if(pending.has(size)){void submit();return;}
        if(award.variant&&!input.value.trim())return;
        confirmation.hidden=false;
        const copy=document.createElement('p');copy.textContent=award.variant?t('Xác nhận đổi tên Champion với giá 500 CB?'):t('Xác nhận tên Champion này?');
        confirmation.replaceChildren(copy,action('Xác nhận',()=>void submit()),action('Hủy',()=>{confirmation.hidden=true;}));
      };
      form.append(label,save,note,confirmation);
      card.append(rarity,heading,name,colors,action('Thử trên khối 3D',preview),equipButton,form);
      return card;
    },
    get error(){return error;},
    get busy(){return busy;},
    dispose(){disposed=true;}
  };
}
