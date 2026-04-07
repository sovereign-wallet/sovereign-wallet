import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}
