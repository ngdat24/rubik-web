import {CubeController} from '@rubik/controller';
import {CubeRenderer} from '@rubik/renderer';
import type {CloudAccount} from './account.js';
import {attachDrag} from './drag.js';
import {attachKeyboard} from './keyboard.js';
import {language, t} from './i18n.js';
import {newId} from './id.js';
import {bindSkinEffects,skinLayout,skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';
import './shop.css';
import {prometheusSeasonBanner} from './prometheus-season-banner.js';
import './prometheus-gameplay.css';
import {championInventory} from './champion-inventory.js';
import type {ChampionAward} from './champion-account.js';
import type {ChampionSize} from './champion-design.js';

type Currency = 'CB' | 'ZN';
type Tier = 'white' | 'blue' | 'purple' | 'gold' | 'red';
type Skin = {
  id:string;
  name:string;
  tier:Tier;
  appearance:Appearance;
};
type Crate = 'core' | 'maglev' | 'quantum';
type Offer = {id:string; tier:Tier; skin:Skin|null; price:number; currency:Currency; purchased:boolean};
type Item = {id:string; kind:'skin'|'utility'; equipped:boolean; expiresAt:string|null; skin:Skin|null;customName?:string|null;nameRequired?:boolean};
type Prize = {skin?:Skin; refund?:{amount:number;currency:Currency}; currency?:Currency; amount?:number; milestone?:number; utility?:string};
type DrawBand = {id:string;weight:number};
type CrateRule = {currency:Currency;single:number;quantity:number;batch:number;purple:number;gold:number;bands:DrawBand[]};
type Catalog = {
  reroll:number[];
  crates:Record<Crate,CrateRule>;
  utilities:Record<string,Partial<Record<Currency,number>> & {days?:number}>;
  wheel:{single:number;batches:number[];bands:DrawBand[]};
};
type Snapshot = {
  catalog:Catalog;
  cb:number; zn:number; offers:Offer[]; rerolls:number; inventory:Item[]; result:Prize[];
  crates:Record<Crate,{enabled:boolean;purpleMisses:number;goldMisses:number}>;
  season:{id:string; name:string; endsAt:string; spins:number; milestones:number[]}|null;
};
type Action =
  | {action:'name_prometheus';name:string}
  | {action:'buy_skin'; offerId:string}
  | {action:'equip_skin'; id:string|null}
  | {action:'equip_utility'; id:string|null; slot:'sound'|'trail'}
  | {action:'buy_utility'; id:string; currency:Currency}
  | {action:'open_crate'; crate:Crate; quantity:number}
  | {action:'spin'; season:string; quantity:number}
  | {action:'reroll'};
const tabs = {
  skins:'Mua skin', crates:'Mở hòm', utilities:'Phụ kiện & Tiện ích',
  season:'Vòng quay mùa giải', inventory:'Kho skin'
};
type Tab = keyof typeof tabs;
const tiers = {white:'Phổ thông', blue:'Hiếm', purple:'Sử thi', gold:'Huyền thoại', red:'Tuyệt phẩm mùa giải'};
const crateNames = {core:'Hòm Phôi Lập Phương',maglev:'Hòm Từ Tính',quantum:'Hòm Lượng Tử'};
const utilities:Record<string,string> = {
  fx_sound_purple_01:'Âm thanh xoay bậc tím',
  fx_trail_purple_01:'Vệt sáng / hiệu ứng giải xong bậc tím',
  fx_trail_gold_01:'Vệt sáng / hiệu ứng giải xong bậc vàng',
  util_nameplate_7d:'Khung tên 7 ngày',
  util_nameplate_30d:'Khung tên 30 ngày'
};
const percent=new Intl.NumberFormat(language==='vi'?'vi-VN':'en',{style:'percent',maximumFractionDigits:1});
const odds=(bands:DrawBand[])=>bands.map(({id,weight})=>{
  const label=id==='cb100'?'100 CB':id==='cb200'?'200 CB':tiers[id as Tier];
  return t(label)+' '+percent.format(weight/1000);
}).join(' · ');
const integer = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en');
const money = (amount:number,currency:Currency) => `${integer.format(amount)} ${currency}`;
const format = (key:string, values:Record<string,string|number>) =>
  t(key).replace(/\{(\w+)\}/g, (match, name:string) => String(values[name] ?? match));
const dateTime = (value:string) => new Date(value).toLocaleString(language === 'vi' ? 'vi-VN' : 'en', {timeZone:'Asia/Ho_Chi_Minh'});
const soundId = (id:string) => id === 'fx_sound_purple_01' ? 'sound_purple_tactile_01' : id;
const trailId = (id:string) => id === 'fx_trail_purple_01' ? 'trail_violet_arc' : 'trail_solar_flare';
const effectSlot = (id:string) => id.startsWith('fx_trail_') ? 'trail'
  : id === 'fx_sound_purple_01' || id.startsWith('sound_') ? 'sound' : undefined;

function node<K extends keyof HTMLElementTagNameMap>(tag:K, text?:string):HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(label:string, click:()=>void, disabled=false) {
  const element = node('button',label);
  element.type = 'button';
  element.disabled = disabled;
  element.addEventListener('click',click);
  return element;
}
class ShopRequestError extends Error {
  constructor(message:string,readonly retry:boolean) {super(message);}
}

export function mountShop(account:CloudAccount|undefined, equip:(appearance?:Appearance)=>void,
  canPreview:()=>boolean,lowFx:()=>boolean,
  equipChampion:(size:ChampionSize,award?:ChampionAward)=>Promise<void>=async()=>{}
) {
  const dialog = document.querySelector<HTMLDialogElement>('#shop-dialog')!;
  const wallet = document.querySelector<HTMLOutputElement>('#shop-wallet')!;
  const tabBar = document.querySelector<HTMLElement>('#shop-tabs')!;
  const status = document.querySelector<HTMLElement>('#shop-status')!;
  const content = document.querySelector<HTMLElement>('#shop-content')!;
  const confirmation = document.querySelector<HTMLElement>('#shop-confirmation')!;
  const preview = document.querySelector<HTMLElement>('#shop-preview')!;
  const previewCube = document.querySelector<HTMLElement>('#shop-preview-cube')!;
  const shopOpen = document.querySelector<HTMLButtonElement>('#shop-open')!;
  const shopClose = document.querySelector<HTMLButtonElement>('#shop-close')!;
  const previewClose = document.querySelector<HTMLButtonElement>('#shop-preview-close')!;
  const abort = new AbortController();
  let active:Tab = 'skins';
  let snapshot:Snapshot|undefined;
  let pending:(Action & {requestId:string})|undefined;
  let releasePreview:(()=>void)|undefined;
  let equippedKey = '';
  const missingPreviews = new Set<string>();
  let busy = false;
  let error = '';
  let inventorySize:ChampionSize=3;
  let prometheusReceipt:string|undefined;
  let previewRevision=0;
  const champions=championInventory(account,()=>render(),equipChampion,canPreview,()=>void load());

  const closePreview = () => {
    previewRevision++;
    releasePreview?.();
    releasePreview = undefined;
    preview.hidden = true;
    content.hidden = false;
  };
  const closeConfirm = () => {
    confirmation.hidden = true;
    confirmation.replaceChildren();
  };
  const switchTab = (tab:Tab) => {
    closePreview();
    closeConfirm();
    active = tab;
    render();
  };
  const showPreview = async(skin:Skin,championSize?:ChampionSize) => {
    if (!canPreview()) {status.textContent=t('Chờ lượt giải kết thúc để xem thử skin.');return;}
    closePreview();
    closeConfirm();
    const revision=previewRevision;
    content.hidden = true;
    preview.hidden = false;
    document.querySelector('#shop-preview-title')!.textContent = t(skin.name);
    let renderer:CubeRenderer|undefined;
    let controller:CubeController|undefined;
    try {
      const surface = skinSurface(skin.appearance);
      if (surface && lowFx()) delete surface.pulse;
      const championDesign=championSize?await import('./champion-design.js'):undefined;
      const design=championDesign?await championDesign.loadChampionDesign(championSize):undefined;
      if(revision!==previewRevision||abort.signal.aborted)return;
      renderer = new CubeRenderer(previewCube,design&&championDesign?championDesign.championRendererOptions(design,'borderless',championSize):{size:3,...skinLayout(skin.appearance),theme:skinPalette(skin.appearance),...(surface ? {surface} : {})});
      controller = new CubeController(renderer,championSize??3);
      const motion=design?await import('./champion-motion.js'):undefined;
      if(revision!==previewRevision||abort.signal.aborted){controller.dispose();return;}
      const championMotion=motion&&design?motion.mountChampionMotion(previewCube,renderer,controller,design.interaction_fx.sound_file,()=>!lowFx(),championSize):undefined;
      const detach = attachDrag(renderer,controller,()=>{},championMotion?.commit);
      const detachKeys = attachKeyboard(controller,()=>{},undefined,undefined,previewCube);
      const effects = bindSkinEffects(renderer,lowFx()?undefined:skin.appearance);
      renderer.onMoveAnimated = () => effects.play();
      releasePreview = () => {championMotion?.dispose();effects.dispose();detachKeys();detach();controller?.dispose();};
      previewCube.focus();
    } catch {
      if (controller) controller.dispose(); else renderer?.dispose();
      if(revision!==previewRevision||abort.signal.aborted)return;
      closePreview();
      status.textContent = t('Chưa thể mở bản xem thử 3D.');
    }
  };
  const canSpend = (price:number,currency:Currency) => Boolean(snapshot) &&
    (currency === 'CB' ? snapshot!.cb : snapshot!.zn) >= price;
  const purchase = (name:string, price:number, currency:Currency, action:Action, label?:string) => button(
    label ?? money(price,currency), () => {
      if(busy||pending||!canSpend(price,currency))return;
      if(action.action==='spin'){
        closeConfirm();
        void load({...action,requestId:newId()});
        return;
      }
      confirmation.hidden = false;
      const confirm = button(t('Xác nhận'), () => {
        closeConfirm();
        void load({...action,requestId:newId()});
      });
      confirmation.replaceChildren(node('p',format('Dùng {price} cho {name}? Giao dịch đã xác nhận không thể hoàn tác.',
        {price:money(price,currency),name})),confirm,button(t('Hủy'),closeConfirm));
      confirm.focus();
    }, busy || Boolean(pending) || !canSpend(price,currency)
  );
  const prometheusNameForm=(item:Item)=>{
    const form=node('form');form.className='champion-name-form';
    const label=node('label',t('Tên skin'));const input=node('input');input.type='text';input.maxLength=32;input.required=true;
    input.value=pending?.action==='name_prometheus'?pending.name:item.customName??'';input.placeholder=language==='en'?'Divine Flame Prometheus':'Lửa thiêng Prometheus';
    input.disabled=busy||Boolean(pending);label.append(input);
    const save=node('button',item.nameRequired?t('Đặt tên & nhận · Miễn phí'):t('Đổi tên · 500 CB'));save.type='submit';
    save.disabled=busy||Boolean(pending)||(!item.nameRequired&&!canSpend(500,'CB'));
    form.append(label,save,node('p',item.nameRequired?t('Đặt tên để hoàn tất nhận skin. Lần đầu miễn phí.'):t('Đổi tên tốn 500 CB/lần.')));
    form.onsubmit=event=>{event.preventDefault();const name=input.value.trim().normalize('NFC');
      if(busy||pending||!name||Array.from(name).length>32)return;
      const submit=()=>{closeConfirm();void load({action:'name_prometheus',name,requestId:newId()});};
      if(item.nameRequired){submit();return;}
      confirmation.hidden=false;
      confirmation.replaceChildren(node('p',t('Xác nhận đổi tên Prometheus với giá 500 CB?')),button(t('Xác nhận'),submit),button(t('Hủy'),closeConfirm));
    };return form;
  };
  const skinCard = (skin:Skin, appendActions:(card:HTMLElement)=>void, literalName=false) => {
    const card = node('article');
    card.className = 'shop-card';
    card.dataset.tier = skin.tier;
    const colors = node('div');
    colors.className = 'shop-swatches';
    colors.setAttribute('aria-hidden','true');
    for (const color of skinPalette(skin.appearance)) {
      const swatch = node('span');
      swatch.style.backgroundColor = '#' + color.toString(16).padStart(6,'0');
      colors.append(swatch);
    }
    card.append(node('p',t(tiers[skin.tier])),node('h3',literalName?skin.name:t(skin.name)),colors,
      button(t('Thử trên khối 3D'),()=>showPreview(skin),busy));
    if (/^[a-z0-9_-]+$/i.test(skin.id) && !missingPreviews.has(skin.id)) {
      const thumbnail = node('img');
      thumbnail.alt = '';
      thumbnail.hidden = true;
      thumbnail.onload = () => {thumbnail.hidden = false;};
      thumbnail.onerror = () => {missingPreviews.add(skin.id);thumbnail.remove();};
      thumbnail.src = '/assets/skins/'+skin.id+'/preview.png';
      card.insertBefore(thumbnail,colors);
    }
    appendActions(card);
    return card;
  };
  const showSkins = (state:Snapshot) => {
    const grid = node('div');
    grid.className = 'shop-grid';
    const cost = state.catalog.reroll[state.rerolls];
    const owned = new Set(state.inventory.filter(item=>item.kind==='skin').map(item=>item.id));
    for (const offer of state.offers) {
      const skin = offer.skin;
      if (!skin) {
        const card = node('article');
        card.className = 'shop-card';
        card.dataset.tier = offer.tier;
        card.append(node('h3',t(tiers[offer.tier])),node('p',t('Đã sở hữu toàn bộ bậc này')));
        grid.append(card);
        continue;
      }
      grid.append(skinCard(skin, card => {
        if (offer.purchased || owned.has(skin.id)) card.append(node('p',t(offer.purchased ? 'Đã mua' : 'Đã sở hữu')));
        else card.append(purchase(t(skin.name),offer.price,offer.currency,{action:'buy_skin',offerId:offer.id}));
      }));
    }
    const rerollAvailable = state.offers.some(offer=>offer.skin && !offer.purchased);
    content.append(node('p',format('Đổi mẫu vào 00:00 (UTC+7). Đã làm mới {count}/4.',{count:state.rerolls})),grid);
    if (cost !== undefined && rerollAvailable) {
      content.append(purchase(t('Làm mới cửa hàng'),cost,'CB',{action:'reroll'},
        format('Làm mới · {price}',{price:money(cost,'CB')})));
    }
  };
  const showCrates = (state:Snapshot) => {
    const grid = node('div');
    grid.className = 'shop-grid';
    for (const id of ['core','maglev','quantum'] as const) {
      const crate={...state.catalog.crates[id],id,name:crateNames[id]};
      const card = node('article');
      card.className = 'shop-card';
      const stats = state.crates[crate.id];
      card.append(node('h3',t(crate.name)),node('p',odds(crate.bands)),
        node('p',format('Bảo hiểm tím trở lên · {count}/{total}',{count:stats.purpleMisses,total:crate.purple})));
      if (crate.gold) card.append(node('p',format('Bảo hiểm vàng · {count}/{total}',{count:stats.goldMisses,total:crate.gold})));
      if (stats.enabled) {
        for (const [quantity,price] of [[1,crate.single],[crate.quantity,crate.batch]] as const) {
          card.append(purchase(t(crate.name),price,crate.currency,{action:'open_crate',crate:crate.id,quantity},
            format('Mở ×{count} · {price}',{count:quantity,price:money(price,crate.currency)})));
        }
      } else card.append(node('p',t('Hòm chưa có đủ skin để mở.')));
      grid.append(card);
    }
    content.append(grid);
  };
  const showUtilities = (state:Snapshot) => {
    const grid = node('div');
    grid.className = 'shop-grid';
    for (const [id, rule] of Object.entries(state.catalog.utilities)) {
      const utility={name:utilities[id] ?? id,prices:rule,duration:rule.days};
      const card = node('article');
      card.className = 'shop-card';
      card.append(node('h3',t(utility.name)));
      const owned = state.inventory.find(item=>item.kind==='utility' && item.id===id);
      if (owned?.expiresAt) card.append(node('p',format('Hết hạn {date}',{date:dateTime(owned.expiresAt)})));
      if (owned && !utility.duration) card.append(node('p',t('Đã sở hữu')));
      else for (const currency of ['CB','ZN'] as const) {
        const price = utility.prices[currency];
        if (price !== undefined) card.append(purchase(t(utility.name),price,currency,{action:'buy_utility',id,currency}));
      }
      grid.append(card);
    }
    content.append(grid);
  };
  const showSeason = (state:Snapshot) => {
    const season = state.season;
    if (!season) {
      content.append(node('p',t('Vòng quay mùa giải chưa mở.')));
      return;
    }
    const completed = season.milestones.includes(30);
    const panel=node('section');panel.className='shop-season-panel';
    if(season.id==='season_01')panel.append(prometheusSeasonBanner(language));
    const journey=node('div');journey.className='shop-season-progress';panel.append(journey);
    const spinActions=node('div');spinActions.className='shop-season-spin-actions';
    spinActions.setAttribute('aria-label',t('Vòng quay mùa giải'));panel.append(spinActions);
    const body=node('div');body.className='shop-season-panel__body';panel.append(body);content.append(panel);
    const progress = node('progress');
    progress.max = 30;
    progress.value = completed ? 30 : season.spins;
    progress.setAttribute('aria-label',t('Tiến độ vòng quay'));
    const milestones = node('ul');
    milestones.className='shop-season-milestones';
    for (const [n, prize] of [[5,'300 CB'],[10,'Skin tím'],[15,'Âm thanh mùa và 500 CB'],[20,'Skin vàng'],[30,'Skin đỏ mùa giải']] as const) {
      const claim = season.milestones.includes(n) ? ` · ${t('Đã nhận')}` : '';
      const milestone=node('li');milestone.style.left=`${n/30*100}%`;milestone.dataset.claimed=String(season.milestones.includes(n));
      milestone.setAttribute('aria-label',`${n} · ${t(prize)}${claim}`);
      const number=node('strong',String(n));number.className='shop-season-milestone-number';
      const label=node('span',t(prize)+(claim?' ✓':''));label.className='shop-season-milestone-label';milestone.append(number,label);milestones.append(milestone);
    }
    const counter=node('p',format('{count} lượt đã quay',{count:season.spins}));counter.className='shop-season-spin-count';
    const track=node('div');track.className='shop-season-progress-track';track.append(progress,milestones);journey.append(counter,track);
    body.append(node('h3',t(season.name)),node('p',format('Kết thúc {date}',{date:dateTime(season.endsAt)})),
      node('p',odds(state.catalog.wheel.bands)));
    if (completed) spinActions.append(node('p',t('Bạn đã hoàn thành vòng quay mùa giải.')));
    else for (const selection of state.catalog.wheel.batches.filter(quantity=>quantity===1||quantity===5)) {
      const quantity=Math.min(selection,30-season.spins), cost=quantity*state.catalog.wheel.single;
      if (selection!==1 && quantity<=1) continue;
      spinActions.append(purchase(t('Vòng quay mùa giải'),cost,'ZN',{action:'spin',season:season.id,quantity:selection},
        selection===1 ? t('Quay · 1 ZN') : format('Quay ×{count} · tối đa {price}',{count:quantity,price:money(cost,'ZN')})));
    }
  };
  const showInventory = (state:Snapshot) => {
    const sizes=node('div');sizes.className='shop-tabs';sizes.setAttribute('aria-label',t('Kích thước skin'));
    for(const size of [2,3] as const){
      const trigger=button(`Skin ${size}×${size}`,()=>{inventorySize=size;closeConfirm();render();});
      trigger.setAttribute('aria-pressed',String(inventorySize===size));sizes.append(trigger);
    }
    content.append(sizes);
    if(champions.error)content.append(node('p',champions.error));
    const grid = node('div');
    grid.className = 'shop-grid';
    const equipped = inventorySize===3&&state.inventory.some(item=>item.kind === 'skin' && item.equipped);
    if (equipped||champions.isEquipped(inventorySize)) content.append(button(t('Dùng màu Rubik mặc định'),() => {
      if(!canPreview()){status.textContent=t('Chờ lượt giải kết thúc để đổi skin.');return;}
      void champions.clear(inventorySize);
      if(inventorySize===3)void load({action:'equip_skin',id:null,requestId:newId()});
    },busy || champions.busy || Boolean(pending)));
    const championCard=champions.card(inventorySize,()=>void showPreview({id:'champion',name:`Champion ${inventorySize}×${inventorySize}`,tier:'gold',appearance:{}},inventorySize));
    if(championCard)grid.append(championCard);
    for (const item of state.inventory) {
      if(inventorySize===2)continue;
      if (item.skin) {
        if(item.id==='s1_red_crimson_core'){
          const personal={...item.skin,name:item.customName??(language==='en'?'Divine Flame Prometheus':'Lửa thiêng Prometheus')};
          const card=skinCard(personal,card=>{
            const image=node('img');image.src='/assets/skins/s1_red_prometheus_flame/preview-current.png';image.alt='Lửa thiêng Prometheus';image.width=image.height=240;image.className='prometheus-inventory-image';card.prepend(image);
            if(item.nameRequired)card.append(node('p',t('Đang chờ đặt tên để nhận skin.')));
            else if(item.equipped&&!champions.isEquipped(3))card.append(node('p',t('Đang trang bị')));
            else card.append(button(t('Trang bị'),()=>{if(!canPreview())return;void champions.clear(3).then(()=>load({action:'equip_skin',id:item.id,requestId:newId()}));},busy||Boolean(pending)));
            card.append(prometheusNameForm(item));
          },true);grid.append(card);continue;
        }
        grid.append(skinCard(item.skin,card=>{
          if (item.equipped&&!champions.isEquipped(3)) card.append(node('p',t('Đang trang bị')));
          else card.append(button(t('Trang bị'),() =>
            {if(!canPreview()){status.textContent=t('Chờ lượt giải kết thúc để đổi skin.');return;}
              void champions.clear(3).then(()=>load({action:'equip_skin',id:item.id,requestId:newId()}));},busy || champions.busy || Boolean(pending)));
        }));
      } else {
        const card = node('article');
        card.className = 'shop-card';
        const utility = utilities[item.id];
        card.append(node('h3',utility ? t(utility) : t('Âm thanh mùa giải')));
        if (item.expiresAt) card.append(node('p',format('Hết hạn {date}',{date:dateTime(item.expiresAt)})));
        const slot = effectSlot(item.id);
        if (slot) card.append(button(t(item.equipped ? 'Gỡ trang bị' : 'Trang bị'), () =>
          void load({action:'equip_utility',id:item.equipped ? null : item.id,slot,requestId:newId()}),busy || Boolean(pending)));
        grid.append(card);
      }
    }
    if (!grid.children.length) content.append(node('p',t('Kho của bạn chưa có vật phẩm.')));
    else content.append(grid);
  };
  const showPrizes = (prizes:Prize[]) => {
    if (!prizes.length) return;
    const list = node('ul');
    list.className = 'shop-prizes';
    for (const prize of prizes) {
      const parts:string[] = [];
      if (prize.milestone) parts.push(format('Mốc {count}',{count:prize.milestone}));
      if (prize.skin) parts.push(t(prize.skin.name));
      if (prize.currency && prize.amount !== undefined) parts.push(money(prize.amount,prize.currency));
      if (prize.utility) parts.push(t('Âm thanh mùa giải'));
      if (prize.refund) parts.push(format('Trùng · hoàn {price}',{price:money(prize.refund.amount,prize.refund.currency)}));
      list.append(node('li',parts.join(' · ')));
    }
    content.append(node('h3',t('Kết quả')),list);
  };
  function render() {
    wallet.textContent = snapshot
      ? `${money(snapshot.cb,'CB')} · ${money(snapshot.zn,'ZN')}`
      : t('Đăng nhập để tích lũy Cubit & Zenith');
    shopOpen.classList.toggle('shop-season-ready',Boolean(snapshot?.season && snapshot.zn > 0 && !snapshot.season.milestones.includes(30)));
    if (!dialog.open) return;
    tabBar.replaceChildren();
    for (const tab of Object.keys(tabs) as Tab[]) {
      const trigger = button(t(tabs[tab]),()=>switchTab(tab),busy);
      trigger.setAttribute('aria-pressed',String(active===tab));
      tabBar.append(trigger);
    }
    status.textContent = busy ? t('Đang kết nối cửa hàng…') : error;
    content.replaceChildren();
    if (pending && !busy) content.append(button(t('Thử lại giao dịch'),()=>void load(pending)));
    if (!snapshot) {
      if (!busy && account) content.append(button(t('Tải lại cửa hàng'),()=>void load()));
      return;
    }
    showPrizes(snapshot.result);
    if(prometheusReceipt){
      const received=node('article');received.className='shop-card prometheus-claim';received.dataset.tier='red';
      const image=node('img');image.src='/assets/skins/s1_red_prometheus_flame/preview-current.png';image.alt='Lửa thiêng Prometheus';image.width=image.height=240;image.className='prometheus-inventory-image';
      received.append(image,node('h3',prometheusReceipt),node('p',t('Đã hoàn tất nhận Lửa thiêng Prometheus.')));content.append(received);
    }
    const unclaimed=snapshot.inventory.find(item=>item.id==='s1_red_crimson_core'&&item.nameRequired);
    if(unclaimed&&active!=='inventory'){
      const claim=node('article');claim.className='shop-card prometheus-claim';claim.dataset.tier='red';
      const image=node('img');image.src='/assets/skins/s1_red_prometheus_flame/preview-current.png';image.alt='Lửa thiêng Prometheus';image.width=image.height=240;image.className='prometheus-inventory-image';claim.append(image);
      claim.append(node('h3',t('Lửa thiêng Prometheus')),node('p',t('Bạn đã nhận quyền sở hữu. Đặt tên để hoàn tất nhận skin.')),prometheusNameForm(unclaimed));content.append(claim);
    }
    ({skins:showSkins,crates:showCrates,utilities:showUtilities,season:showSeason,inventory:showInventory})[active](snapshot);
  }
  function equipFrom(state:Snapshot) {
    const personal=state.inventory.find(item=>item.id==='s1_red_crimson_core'&&item.equipped&&!item.nameRequired);
    let nameplate=document.querySelector<HTMLElement>('#prometheus-personal-name');
    if(!nameplate){nameplate=node('div');nameplate.id='prometheus-personal-name';nameplate.className='prometheus-personal-name';document.querySelector('#viewport,#stage')?.append(nameplate);}
    nameplate.textContent=personal?.customName??'';nameplate.hidden=!personal?.customName;
    const skin = state.inventory.find(item=>item.kind==='skin' && item.equipped)?.skin;
    const viewport=document.querySelector<HTMLElement>('#viewport');
    if(viewport){viewport.dataset.prometheusEquipped=String(skin?.id==='s1_red_crimson_core');viewport.classList.toggle('prometheus-gameplay',skin?.id==='s1_red_crimson_core'&&!champions.isEquipped(3)&&document.querySelector<HTMLSelectElement>('#cube-size')?.value==='3');}
    const effects = state.inventory.filter(item=>item.kind==='utility' && item.equipped);
    const sound = effects.find(item=>effectSlot(item.id)==='sound')?.id;
    const trail = effects.find(item=>effectSlot(item.id)==='trail')?.id;
    const key = [skin?.id,sound,trail].join('|');
    if (equippedKey === key) return;
    equippedKey = key;
    if (!skin && !sound && !trail) {equip();return;}
    equip({...skin?.appearance,interaction_fx:{
      sound_pack_id:sound ? soundId(sound) : skin?.appearance.interaction_fx?.sound_pack_id ?? null,
      trail_effect_id:trail ? trailId(trail) : skin?.appearance.interaction_fx?.trail_effect_id ?? null
    }});
  }
  async function load(action?:Action & {requestId:string}) {
    if (!account || busy || abort.signal.aborted) return;
    busy = true;
    error = '';
    if (action) pending = action;
    render();
    try {
      const response = await fetch('/api/shop',{
        method:action?'POST':'GET',
        headers:{Authorization:'Bearer '+await account.token(),...(action?{'Content-Type':'application/json'}:{})},
        ...(action?{body:JSON.stringify(action)}:{}),
        signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])
      });
      if (!response.ok) {
        const body = await response.json().catch(()=>({}));
        throw new ShopRequestError(body.error ?? 'Chưa kết nối được cửa hàng.',response.status >= 500 || response.status === 429);
      }
      const state:Snapshot = await response.json();
      if (abort.signal.aborted) return;
      const firstPrometheusName=action?.action==='name_prometheus'&&snapshot?.inventory.some(item=>item.id==='s1_red_crimson_core'&&item.nameRequired);
      snapshot = state;
      if(action?.action==='name_prometheus'&&(firstPrometheusName||prometheusReceipt))prometheusReceipt=state.inventory.find(item=>item.id==='s1_red_crimson_core')?.customName??undefined;
      if(!action)await champions.refresh();
      if (action) {
        pending = undefined;
        window.dispatchEvent(new Event('rubik-shop-updated'));
      }
      equipFrom(state);
      if (action && !action.action.startsWith('equip') && !state.result.length) error = t('Giao dịch thành công.');
    } catch (failure) {
      if (failure instanceof ShopRequestError && !failure.retry && action) pending = undefined;
      if (!abort.signal.aborted) error = failure instanceof ShopRequestError ? t(failure.message) : t('Chưa kết nối được cửa hàng.');
    } finally {
      busy = false;
      if (!abort.signal.aborted) render();
    }
  }
  const open = (tab:Tab) => {
    if (document.querySelector('dialog[open]')) return;
    dialog.showModal();
    if (!account) error = t('Đăng nhập để tích lũy Cubit & Zenith');
    switchTab(tab);
    if (!pending) void load();
  };
  shopOpen.onclick = () => open('skins');
  if(new URLSearchParams(location.search).get('panel')==='shop')open('skins');
  shopClose.onclick = () => dialog.close();
  previewClose.onclick = closePreview;
  dialog.onclose = () => {closePreview();closeConfirm();};
  const profileUpdated = () => {if (!pending) void load();};
  window.addEventListener('rubik-profile-updated',profileUpdated);
  render();
  void load();
  const requestedSize=new URLSearchParams(location.search).get('inventory');
  if(requestedSize==='2'||requestedSize==='3'){inventorySize=Number(requestedSize) as ChampionSize;open('inventory');}
  return {dispose:()=>{
    abort.abort();
    champions.dispose();
    window.removeEventListener('rubik-profile-updated',profileUpdated);
    closePreview();
    closeConfirm();
    if (dialog.open) dialog.close();
    for (const element of [shopOpen,shopClose,previewClose]) element.onclick = null;
    dialog.onclose = null;
  }};
}
