import type { EzyApi } from './index';

declare global {
  interface Window {
    ezy: EzyApi;
  }
}

export {};
