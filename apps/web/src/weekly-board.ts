import {formatTime} from '@rubik/engine';
import {t} from './i18n.js';

export function mountWeeklyBoard() {
  const panel=document.querySelector<HTMLDetailsElement>('#weekly-board')!;
  const size=document.querySelector<HTMLSelectElement>('#weekly-size')!;
  const week=document.querySelector<HTMLSelectElement>('#weekly-period')!;
  const rows=document.querySelector<HTMLTableSectionElement>('#weekly-rows')!;
  const status=document.querySelector<HTMLElement>('#weekly-status')!;
  const abort=new AbortController();
  let revision=0;
  for (let n=2;n<=10;n++) {
    const option=document.createElement('option');
    option.value=String(n);option.textContent=`${n}×${n}`;option.selected=n===3;
    size.append(option);
  }
  async function load() {
    if (!panel.open) return;
    const id=++revision;
    status.textContent=t('Đang tải bảng…');
    try {
      const response=await fetch('/api/weekly-leaderboard?size='+size.value+'&week='+week.value,
        {signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
      if (!response.ok) throw new Error();
      const board=await response.json();
      if (abort.signal.aborted || id!==revision) return;
      rows.replaceChildren();
      for (const item of board.rows) {
        const row=rows.insertRow();
        for (const value of [String(item.rank), item.name, formatTime(item.timeMs),
          item.rewardZn === null ? '—' : item.rewardZn+' ZN']) row.insertCell().textContent=value;
      }
      status.textContent=board.rows.length
        ? board.weekStart+' – '+board.weekEnd+' · UTC+7'
        : t('Chưa có kết quả.');
    } catch {
      if (!abort.signal.aborted && id===revision) status.textContent=t('Chưa tải được bảng tuần.');
    }
  }
  const change=()=>void load();
  panel.addEventListener('toggle',change);
  size.addEventListener('change',change);week.addEventListener('change',change);
  return {dispose:()=>{
    abort.abort();
    panel.removeEventListener('toggle',change);
    size.removeEventListener('change',change);week.removeEventListener('change',change);
  }};
}
