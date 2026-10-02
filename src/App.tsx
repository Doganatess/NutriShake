/**
 * Compatibility entry point for tooling that still imports the project-root App.
 * The maintained application lives in src/App.tsx and is the Vite entry used by
 * index.html. Keeping a single implementation prevents the root copy drifting.
 */
export { default } from './src/App.js';
