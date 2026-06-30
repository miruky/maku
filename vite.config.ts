import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// GitHub Pagesではリポジトリ名のサブパスで配信されるため、
// デプロイ時に BASE_PATH 環境変数で base を差し替える。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    rollupOptions: {
      // 本体(index.html)と発表者コンソール(presenter.html)の2ページ構成。
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        presenter: fileURLToPath(new URL('./presenter.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
