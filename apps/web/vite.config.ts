import {defineConfig} from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        leaderboard: 'leaderboard.html',
        main: 'index.html',
        race: 'race.html',
        timeLimit: 'time-limit.html',
        champion: 'champion.html',
        account: 'account-access.html',
        privacy: 'privacy.html',
        prometheus: 'prometheus.html',
        ...(process.env.VERCEL_ENV === 'preview' ? {skinLighting: 'skin-lighting-preview.html',championIce: 'champion-ice-preview.html'} : {}),
      },
    },
  },
});

