import "server-only";

import type { MessageSender, OutgoingEmail } from "./types";

export type OutboxEntry = OutgoingEmail & { id: number; sentAt: Date };

const MAX_ENTRIES = 50;

// En memoria del proceso: se pierde al reiniciar. globalThis evita que el
// recargado en caliente de next dev lo duplique.
const store = globalThis as unknown as { devOutbox?: OutboxEntry[] };

function entries() {
  store.devOutbox ??= [];
  return store.devOutbox;
}

export const devOutboxSender: MessageSender = {
  async sendEmail(message) {
    const list = entries();
    list.unshift({ ...message, id: Date.now(), sentAt: new Date() });
    list.length = Math.min(list.length, MAX_ENTRIES);
  },
};

export function listDevOutbox(): readonly OutboxEntry[] {
  return entries();
}
