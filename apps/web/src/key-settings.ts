import { DEFAULT_KEYMAP, assignBinding, bindingConflict, canonicalBinding, importSettings,
  isAssignableCode, loadSettings, saveSettings, validProfileName, validateSettings } from '@rubik/controller';
import type { Keymap, KeymapSettings } from '@rubik/controller';

export function mountKeySettings(): {getKeymap: () => Keymap; dispose: () => void} {
  const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('key-settings');
  const message = el('key-settings-message'), storageMessage = el('key-storage-status');
  const profileSelect = el<HTMLSelectElement>('key-profile');
  const rows = el('key-bindings'), conflictPanel = el('key-conflict');
  const replacement = el<HTMLSelectElement>('key-replace');
  const listeners: (() => void)[] = [];
  const on = (target: EventTarget, type: string, listener: EventListener): void => {
    target.addEventListener(type, listener); listeners.push(() => target.removeEventListener(type, listener));
  };
  const loaded = loadSettings(() => localStorage);
  let settings = loaded.settings;
  storageMessage.textContent = loaded.warning;
  let capture: string | undefined;
  let pending: {code: string; move: string} | undefined;
  let disposed = false;
  const extras = new Set<string>();
  const bindings = (): Record<string, string> => settings.profiles[settings.activeProfile]!.bindings;
  const cancelCapture = (): void => { capture = undefined; pending = undefined; conflictPanel.hidden = true; };
  const persist = (): void => {
    storageMessage.textContent = saveSettings(settings, () => localStorage) ? '' : 'Không lưu được trên trình duyệt; cấu hình vẫn dùng trong phiên này. Hãy xuất JSON để sao lưu.';
  };
  const commit = (next: KeymapSettings): void => { settings = validateSettings(next); cancelCapture(); persist(); render(); };
  const editableSettings = (): KeymapSettings => {
    const next = structuredClone(settings);
    if (next.activeProfile === 'default') {
      if (Object.keys(next.profiles).length >= 20) throw new Error('Tối đa 20 hồ sơ. Hãy xóa một hồ sơ trước.');
      let name = 'custom', count = 1;
      while (Object.hasOwn(next.profiles, name)) name = `custom-${count++}`;
      next.profiles[name] = {bindings: {...DEFAULT_KEYMAP}};
      next.activeProfile = name;
    }
    return next;
  };
  function render(): void {
    profileSelect.replaceChildren();
    for (const name of Object.keys(settings.profiles)) profileSelect.add(new Option(name, name));
    profileSelect.value = settings.activeProfile;
    el<HTMLButtonElement>('key-profile-delete').disabled = settings.activeProfile === 'default';
    rows.replaceChildren();
    const moves = new Set([...Object.values(DEFAULT_KEYMAP), ...Object.values(bindings()), ...extras]);
    for (const move of moves) {
      const row = document.createElement('div'); row.className = 'key-row'; row.dataset.move = move;
      const label = document.createElement('strong'); label.textContent = move; row.append(label);
      const codes = Object.keys(bindings()).filter(code => bindings()[code] === move);
      if (!codes.length) {const warning=document.createElement('span'); warning.textContent='Chưa có phím'; row.append(warning);}
      for (const code of codes) {
        const remove = document.createElement('button'); remove.type='button'; remove.textContent=`Gỡ ${code}`;
        remove.dataset.remove=code; row.append(remove);
      }
      const assign = document.createElement('button'); assign.type='button'; assign.textContent='Gán phím'; assign.dataset.assign=move;
      row.append(assign); rows.append(row);
    }
  }
  const report = (operation: () => void): void => {
    try {operation();} catch(error) {message.textContent=error instanceof Error ? error.message : 'Không thay đổi được cấu hình.';}
  };
  const apply = (mode: 'swap' | 'reassign'): void => report(() => {
    if (!pending) return;
    const {code, move} = pending;
    const source = bindingConflict(bindings(), code, move).source;
    const next = editableSettings();
    const result = assignBinding(bindings(), code, move, mode, replacement.value || undefined);
    next.profiles[next.activeProfile]!.bindings = result;
    commit(next);
    message.textContent = `Đã gán ${code} cho ${move}.` + (source && source !== move && !Object.values(result).includes(source) ? ` Nước ${source} không còn phím.` : '');
  });
  on(el('key-settings-open'), 'click', () => {cancelCapture(); message.textContent=''; render(); dialog.showModal();});
  on(el('key-settings-close'), 'click', () => dialog.close());
  on(dialog, 'close', () => cancelCapture());
  on(dialog, 'cancel', event => {if (capture || pending) {event.preventDefault(); cancelCapture(); message.textContent='Đã hủy gán phím.';}});
  on(profileSelect, 'change', () => report(() => commit({...settings, activeProfile: profileSelect.value})));
  on(el('key-profile-form'), 'submit', event => {
    event.preventDefault(); report(() => {
      const name = el<HTMLInputElement>('key-profile-name').value.trim();
      if (!validProfileName(name) || Object.hasOwn(settings.profiles,name)) throw new Error('Tên hồ sơ không hợp lệ hoặc đã tồn tại.');
      const next = structuredClone(settings); next.profiles[name] = {bindings:{...bindings()}}; next.activeProfile=name; commit(next);
      el<HTMLInputElement>('key-profile-name').value=''; message.textContent='Đã tạo hồ sơ.';
    });
  });
  on(el('key-profile-delete'), 'click', () => report(() => {
    if (settings.activeProfile === 'default') return;
    const next=structuredClone(settings); delete next.profiles[next.activeProfile]; next.activeProfile='default'; commit(next); message.textContent='Đã xóa hồ sơ.';
  }));
  on(el('key-add-move'), 'submit', event => {
    event.preventDefault(); report(() => {const move=canonicalBinding(el<HTMLInputElement>('key-move').value.trim()); extras.add(move); cancelCapture(); render(); message.textContent=`Chọn Gán phím ở dòng ${move}.`;});
  });
  on(rows, 'click', event => report(() => {
    const button=(event.target as Element).closest<HTMLButtonElement>('button');
    if (button?.dataset.assign) {cancelCapture(); capture=button.dataset.assign; message.textContent=`Nhấn phím cho ${capture} (không kèm Shift/Alt/Ctrl/Meta). Esc để hủy.`;}
    if (button?.dataset.remove) {
      const next=editableSettings(); delete next.profiles[next.activeProfile]!.bindings[button.dataset.remove]; commit(next); message.textContent='Đã gỡ phím; nước không có phím vẫn dùng được bằng nút/chuỗi.';
    }
  }));
  on(window, 'keydown', event => {
    if (!dialog.open || !capture) return;
    const key=event as KeyboardEvent;
    if (key.code==='Escape' || key.code==='Tab' || key.repeat || key.isComposing || /^(Shift|Alt|Control|Meta)/.test(key.code)) return;
    key.preventDefault();
    if (key.ctrlKey || key.metaKey || key.altKey || key.shiftKey || !isAssignableCode(key.code)) {message.textContent='Phím này bị khóa hoặc có modifier. Hãy chọn một phím chữ/dấu khác.'; return;}
    pending={code:key.code,move:capture}; capture=undefined;
    const conflict=bindingConflict(bindings(), pending.code,pending.move);
    if (conflict.source===pending.move) {cancelCapture(); message.textContent='Phím này đã thuộc nước đang chọn.'; return;}
    replacement.replaceChildren(new Option('Không thay phím hiện tại',''));
    for(const code of conflict.targetKeys) replacement.add(new Option(code,code));
    if (conflict.needsReplacement) replacement.value=conflict.targetKeys[0]!;
    if (!conflict.source && !conflict.needsReplacement) {apply('reassign'); return;}
    el('key-conflict-message').textContent=`${pending.code}: ${conflict.source ?? 'chưa gán'} → ${pending.move}.` + (conflict.needsReplacement ? ' Nước đích đủ hai phím: chọn phím để thay.' : ' Chọn cách giải quyết.');
    el<HTMLButtonElement>('key-swap').disabled=!conflict.source || !conflict.targetKeys.length;
    conflictPanel.hidden=false;
  });
  on(el('key-reassign'),'click',()=>apply('reassign'));
  on(el('key-swap'),'click',()=>apply('swap'));
  on(el('key-cancel'),'click',()=>{cancelCapture();message.textContent='Đã hủy; cấu hình giữ nguyên.';});
  on(el('key-reset'),'click',()=>report(()=>{
    const next=structuredClone(settings); next.profiles[next.activeProfile]!.bindings={...DEFAULT_KEYMAP}; commit(next); message.textContent='Đã khôi phục hồ sơ này về mặc định.';
  }));
  on(el('key-export'),'click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(settings,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download='rubik-keymap.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  on(el('key-import'),'change',()=>{
    const input=el<HTMLInputElement>('key-import'), file=input.files?.[0]; input.value='';
    if (!file) return;
    if (file.size>100_000) {message.textContent='Tệp cấu hình quá lớn.';return;}
    void file.text().then(text=>{if(!disposed) report(()=>{commit(importSettings(text)); message.textContent='Đã nhập cấu hình.';});})
      .catch(()=>{if(!disposed) message.textContent='Không đọc được tệp cấu hình.';});
  });
  render();
  return {getKeymap:()=>bindings(),dispose:()=>{disposed=true;for(const remove of listeners)remove(); dialog.close();}};
}
