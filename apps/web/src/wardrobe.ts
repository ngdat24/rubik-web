import {CubeController} from '@rubik/controller';
import {CubeRenderer, WESTERN_COLORS} from '@rubik/renderer';
import type {ColorTheme} from '@rubik/renderer';
import type {CloudAccount} from './account.js';
import {attachDrag} from './drag.js';
import {attachKeyboard} from './keyboard.js';
import {t} from './i18n.js';
import './wardrobe.css';

interface Palette {id:string;name:string;colors:ColorTheme;owned:boolean}
interface Inventory {equipped:string|null;skins:Palette[]}

export function mountWardrobe(account:CloudAccount|undefined, setTheme:(colors:ColorTheme)=>void) {
  const dialog = document.querySelector<HTMLDialogElement>('#wardrobe')!;
  const open = document.querySelector<HTMLButtonElement>('#wardrobe-open')!;
  const close = document.querySelector<HTMLButtonElement>('#wardrobe-close')!;
  const cards = document.querySelector<HTMLElement>('#wardrobe-cards')!;
  const status = document.querySelector<HTMLElement>('#wardrobe-status')!;
  const preview = document.querySelector<HTMLElement>('#wardrobe-preview')!;
  const previewTitle = document.querySelector<HTMLElement>('#wardrobe-preview-title')!;
  const previewBox = document.querySelector<HTMLElement>('#wardrobe-preview-cube')!;
  const previewClose = document.querySelector<HTMLButtonElement>('#wardrobe-preview-close')!;
  const lifetime = new AbortController();
  let releasePreview:(()=>void)|undefined;
  let previewTrigger:HTMLElement|undefined;
  let state:Inventory|undefined;
  let busy = false;

  function stopPreview() {
    releasePreview?.();
    releasePreview = undefined;
    preview.hidden = true;
    cards.hidden = false;
    if (dialog.open) previewTrigger?.focus();
    previewTrigger = undefined;
  }
  function showPreview(palette:Palette, trigger:HTMLElement) {
    stopPreview();
    status.textContent = '';
    cards.hidden = true;
    preview.hidden = false;
    previewTitle.textContent = palette.name;
    let renderer:CubeRenderer|undefined;
    let controller:CubeController|undefined;
    try {
      renderer = new CubeRenderer(previewBox,{theme:palette.colors});
      controller = new CubeController(renderer);
      const detach = attachDrag(renderer,controller,()=>{});
      const detachKeyboard = attachKeyboard(controller,()=>{},undefined,undefined,previewBox);
      releasePreview = () => {detachKeyboard();detach();controller?.dispose();};
      previewTrigger = trigger;
      previewBox.focus();
    } catch {
      if (controller) controller.dispose(); else renderer?.dispose();
      stopPreview();
      status.textContent = t('Chưa thể mở bản xem thử 3D.');
    }
  }
  function button(label:string, action:()=>void) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = t(label);
    element.onclick = action;
    return element;
  }
  function render() {
    cards.replaceChildren();
    if (!dialog.open || !state) return;
    const palettes = [{id:'',name:t('Màu Rubik mặc định'),colors:WESTERN_COLORS,owned:true},...state.skins];
    for (const palette of palettes) {
      const card = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = palette.name;
      const swatches = document.createElement('div');
      swatches.className = 'wardrobe-colors';
      swatches.setAttribute('aria-hidden','true');
      for (const color of palette.colors) {
        const swatch = document.createElement('span');
        swatch.style.backgroundColor = '#' + color.toString(16).padStart(6,'0');
        swatches.append(swatch);
      }
      const previewButton = button('Thử trên khối 3D',()=>showPreview(palette,previewButton));
      previewButton.disabled = busy;
      card.append(title,swatches,previewButton);
      if ((state.equipped ?? '') === palette.id || !palette.owned) {
        const label = document.createElement('p');
        label.textContent = t(palette.owned ? 'Đang trang bị' : 'Chưa sở hữu');
        card.append(label);
      } else {
        const equip = button('Trang bị',()=>void load({skinId:palette.id || null}));
        equip.disabled = busy;
        card.append(equip);
      }
      cards.append(card);
    }
  }
  async function load(selection?:{skinId:string|null}) {
    if (!account) {
      status.textContent = t('Đặt tên hồ sơ để sử dụng kho skin.');
      return;
    }
    if (busy || lifetime.signal.aborted) return;
    busy = true;
    status.textContent = t('Đang tải kho skin…');
    render();
    try {
      const response = await fetch('/api/skins',{
        method:selection?'POST':'GET',
        headers:{Authorization:'Bearer '+await account.token(),...(selection?{'Content-Type':'application/json'}:{})},
        ...(selection?{body:JSON.stringify(selection)}:{}),
        signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(11000)])
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Chưa kết nối được kho skin.');
      if (lifetime.signal.aborted) return;
      state = payload;
      const equipped = state?.skins.find(palette=>palette.id===state?.equipped && palette.owned);
      setTheme(equipped?.colors ?? WESTERN_COLORS);
      status.textContent = selection ? t('Đã cập nhật skin.') : '';
    } catch (error) {
      if (!lifetime.signal.aborted) {
        const message = error instanceof Error ? error.message : '';
        status.textContent = t(['Đặt tên hồ sơ để sử dụng kho skin.','Bạn chưa sở hữu skin này.'].includes(message)
          ? message : 'Chưa kết nối được kho skin.');
      }
    } finally {
      busy = false;
      if (!lifetime.signal.aborted && preview.hidden) render();
    }
  }
  const refresh = () => {void load();};
  open.onclick = () => {
    if (document.querySelector('dialog[open]')) return;
    dialog.showModal();
    render();
    refresh();
  };
  close.onclick = () => dialog.close();
  previewClose.onclick = stopPreview;
  dialog.onclose = stopPreview;
  window.addEventListener('rubik-profile-updated',refresh);
  if (account) refresh();
  return {dispose:()=>{
    lifetime.abort();
    window.removeEventListener('rubik-profile-updated',refresh);
    stopPreview();
    dialog.onclose = null;
    if (dialog.open) dialog.close();
    open.onclick = close.onclick = previewClose.onclick = null;
  }};
}
