declare module '*.node' {
  export function attach(handle: Buffer): void;
  export function isAttached(handle: Buffer): boolean;
  export const taskbarMessage: number;
}
