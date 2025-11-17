import { defineConfig } from 'vitest/config';

// GitHub Pagesではリポジトリ名のサブパスで配信されるため、
// デプロイ時に BASE_PATH 環境変数で base を差し替える。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
