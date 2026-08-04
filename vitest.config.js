import { defineConfig } from 'vite';

// File config rieng cho Vitest (khong dung chung vite.config.js) - vite.config.js o day nhung 1
// dev server backend day du (route sync, notifications, segments...) ben trong plugin
// configureServer, khong nen bi Vitest tai/khoi tao khi chi muon chay unit test cho src/services.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
