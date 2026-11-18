import {formatTime} from '@rubik/engine';
import type {CloudAccount} from './account.js';
import {t} from './i18n.js';
import {startQuestHeartbeat} from './quest-heartbeat.js';

interface QuestProgress {
  completed: number;
  counts: [number, number, number, number];
  onlineSeconds: number;
}

export function mountDailyQuests(account: CloudAccount | undefined): () => void {
  const panel = document.querySelector<HTMLDetailsElement>('#quest-panel')!;
  const summary = panel.querySelector('summary')!;
  const status = document.querySelector<HTMLElement>('#quest-status')!;
  const content = document.querySelector<HTMLElement>('#quest-progress')!;
  const timeLimit = document.querySelector<HTMLElement>('#quest-time-limit')!;
  const onlineStatus = document.querySelector<HTMLElement>('#quest-online-status')!;
  const onlineTime = document.querySelector<HTMLElement>('#quest-online-time')!;
  const targets = ['2', '3', 'other'].map(key => ({
    count: document.querySelector<HTMLElement>(`#quest-count-${key}`)!,
    bar: document.querySelector<HTMLElement>(`#quest-bar-${key}`)!,
  }));
  const abort = new AbortController();
  let version = 0;

  function show(progress: QuestProgress): void {
    version++;
    const [two, three, four, large] = progress.counts;
    const counts = [two, three, four + large];
    for (const [index, {count, bar}] of targets.entries()) {
      const max = Number(bar.getAttribute('aria-valuemax'));
      const value = Math.min(counts[index]!, max);
      count.textContent = value === max ? t('Đã xong') : `(${value}/${max})`;
      bar.setAttribute('aria-valuenow', String(value));
      bar.style.setProperty('--quest-fill', String(value / max));
    }
    timeLimit.textContent = (progress.completed & 2) ? t('Đã xong') : '(0/1)';
    const seconds = Math.min(progress.onlineSeconds, 600);
    onlineStatus.textContent = (progress.completed & 4) ? t('Đã xong') : `(${seconds}/600)`;
    onlineTime.textContent = `${formatTime(seconds * 1000)} / 10:00`;
    status.hidden = true;
    content.hidden = false;
  }

  async function refresh(): Promise<void> {
    if (!panel.open || abort.signal.aborted) return;
    if (!account) {
      status.textContent = t('Đặt tên hồ sơ để xem nhiệm vụ.');
      return;
    }
    const request = ++version;
    try {
      const response = await fetch('/api/quests', {
        headers: {Authorization: 'Bearer ' + await account.token()},
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
      });
      if (response.status === 403 && request === version) {
        status.textContent = t('Đặt tên hồ sơ để xem nhiệm vụ.');
        status.hidden = false;
        return;
      }
      if (!response.ok) throw new Error('Quest progress unavailable');
      const progress: QuestProgress = await response.json();
      if (request === version && !abort.signal.aborted) show(progress);
    } catch {
      if (request === version && !abort.signal.aborted) {
        status.textContent = t('Không tải được tiến trình nhiệm vụ.');
        status.hidden = false;
      }
    }
  }

  const stopHeartbeat = startQuestHeartbeat<QuestProgress>(account, show);
  const update = () => void refresh();
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !panel.open) return;
    panel.open = false;
    summary.focus();
  };
  panel.addEventListener('toggle', update);
  panel.addEventListener('keydown', closeOnEscape);
  window.addEventListener('rubik-quest-solve-synced', update);
  window.addEventListener('rubik-profile-updated', update);
  return () => {
    stopHeartbeat();
    abort.abort();
    panel.removeEventListener('toggle', update);
    panel.removeEventListener('keydown', closeOnEscape);
    window.removeEventListener('rubik-quest-solve-synced', update);
    window.removeEventListener('rubik-profile-updated', update);
  };
}
