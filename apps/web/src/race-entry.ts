const useDuel = import.meta.env.VITE_ONE_ON_ONE_MATCHES === '1' && !new URLSearchParams(location.search).has('room');
const loading = document.querySelector('#race-loading')!;

void (useDuel ? import('./one-on-one.js') : import('./race.js')).then(() => {
  loading.remove();
  document.body.removeAttribute('data-race-loading');
}).catch(error => {
  console.error('Failed to load 1v1', error);
  loading.textContent = 'Không tải được 1v1. Hãy tải lại trang. / Could not load 1v1. Please reload.';
});
