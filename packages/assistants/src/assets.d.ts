// Bundled as text by tsup (and by the Vitest config in tests).
declare module '*.md' {
  const content: string;
  export default content;
}
