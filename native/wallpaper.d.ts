declare module '*.node' {
  export function createWindow(factory: () => Buffer): void;
  export function attach(handle: Buffer): void;
  export function isAttached(handle: Buffer): boolean;
  export const taskbarMessage: number;
}
