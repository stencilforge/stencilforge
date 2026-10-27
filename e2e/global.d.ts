export {};
declare global {
  interface Window {
    // Dev-only handle to the studio store, used by the browser tests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __studio: { getState: () => any };
  }
}
