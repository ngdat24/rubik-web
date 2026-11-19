if (import.meta.env.VITE_ONE_ON_ONE_MATCHES === '1' && !new URLSearchParams(location.search).has('room')) {
  void import('./one-on-one.js');
} else {
  void import('./race.js');
}
