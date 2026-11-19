import './community-chat.css';
import type {CloudAccount} from './account.js';
import {t} from './i18n.js';

interface ChatMessage {
  id: number;
  display_name: string;
  message: string;
  created_at: string;
}

const vietnamTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function renderMessage(message: ChatMessage): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'community-chat-line';
  line.dataset.id = String(message.id);
  const time = document.createElement('time');
  time.dateTime = message.created_at;
  time.textContent = vietnamTime.format(new Date(message.created_at));
  const name = document.createElement('strong');
  name.textContent = '@' + message.display_name;
  const separator = document.createElement('span');
  separator.className = 'community-chat-separator';
  separator.textContent = ': ';
  line.append(time, ' ', name, separator, message.message);
  return line;
}

export function mountCommunityChat(accountReady: Promise<CloudAccount | undefined>): () => void {
  const list = document.querySelector<HTMLElement>('#chat-messages')!;
  const form = document.querySelector<HTMLFormElement>('#chat-form')!;
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  const status = document.querySelector<HTMLElement>('#chat-status')!;
  const abort = new AbortController();
  let loading = false;
  let initialized = false;
  let hasOlder = true;

  function announce(message: string) {
    status.textContent = t(message);
    status.hidden = !message;
  }

  async function load(older = false) {
    if (loading || abort.signal.aborted || (older && !hasOlder)) return;
    const endpoint = older ? list.firstElementChild : list.lastElementChild;
    const id = endpoint?.getAttribute('data-id');
    if (older && !id) return;
    loading = true;
    try {
      const query = id ? '?' + (older ? 'before' : 'after') + '=' + id : '';
      const response = await fetch('/api/chat' + query, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)])
      });
      if (!response.ok) throw new Error();
      const {rows} = await response.json() as {rows: ChatMessage[]};
      if (abort.signal.aborted) return;
      if (older || !initialized) hasOlder = rows.length === 15;
      const follow = !initialized || list.scrollHeight - list.scrollTop - list.clientHeight < 24;
      const anchor = list.firstElementChild?.getBoundingClientRect().top;
      const lines = rows.map(renderMessage);
      if (older) {
        list.prepend(...lines);
        if (endpoint && anchor !== undefined) list.scrollTop += endpoint.getBoundingClientRect().top - anchor;
      } else {
        list.append(...lines);
        const cutoff = Date.now() - 172800000;
        while (list.firstElementChild) {
          const date = list.firstElementChild.querySelector('time')?.dateTime;
          if (!date || Date.parse(date) > cutoff) break;
          const height = list.firstElementChild.getBoundingClientRect().height;
          list.firstElementChild.remove();
          if (!follow) list.scrollTop -= height;
        }
        if (follow) list.scrollTop = list.scrollHeight;
      }
      if (!initialized) announce('');
      initialized = true;
    } catch {
      if (!initialized && !abort.signal.aborted) announce('Chưa tải được kênh chat.');
    } finally {
      loading = false;
    }
  }

  function loadOlder() {
    if (list.scrollTop < 28 && list.scrollHeight > list.clientHeight) void load(true);
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || button.disabled) return;
    button.disabled = true;
    try {
      const account = await accountReady;
      if (!account) {
        announce('Đăng nhập Google để gửi tin nhắn.');
        return;
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + await account.token()},
        body: JSON.stringify({message}),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)])
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? 'Chưa gửi được tin nhắn.');
      }
      if (input.value.trim() === message) input.value = '';
      announce('');
      void load();
    } catch (error) {
      if (!abort.signal.aborted) announce(error instanceof Error ? error.message : 'Chưa gửi được tin nhắn.');
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener('submit', send);
  list.addEventListener('scroll', loadOlder);
  void load();
  const timer = window.setInterval(() => {
    if (!document.hidden) void load();
  }, 4500);
  return () => {
    abort.abort();
    clearInterval(timer);
    form.removeEventListener('submit', send);
    list.removeEventListener('scroll', loadOlder);
  };
}
