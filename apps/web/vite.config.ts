import {defineConfig} from 'vite';
export default defineConfig({build:{rollupOptions:{input:{leaderboard:'leaderboard.html',main:'index.html',race:'race.html',timeLimit:'time-limit.html',champion:'champion.html'}}}});

