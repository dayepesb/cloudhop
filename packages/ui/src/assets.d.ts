// Bundled as text by tsup (and by the Vitest config in tests).
declare module '*.html' {
  const content: string;
  export default content;
}

declare module '*/assets/app.js' {
  const content: string;
  export default content;
}
