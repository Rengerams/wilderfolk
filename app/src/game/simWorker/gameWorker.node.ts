/**
 * Node worker_threads entry — polyfills `self` before loading the shared worker module.
 */
import { isMainThread, parentPort } from 'node:worker_threads';

if (!isMainThread && parentPort) {
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  const messageListeners = new Set<(event: MessageEvent) => void>();

  const dispatchMessage = (data: unknown): void => {
    const event = { data } as MessageEvent;
    messageHandler?.(event);
    for (const listener of messageListeners) listener(event);
  };

  const scope = {
    postMessage(message: unknown, transfer?: Transferable[]): void {
      parentPort!.postMessage(message, transfer);
    },
    get onmessage(): ((event: MessageEvent) => void) | null {
      return messageHandler;
    },
    set onmessage(handler: ((event: MessageEvent) => void) | null) {
      messageHandler = handler;
    },
    addEventListener(type: string, handler: (event: MessageEvent) => void): void {
      if (type === 'message') messageListeners.add(handler);
    },
    removeEventListener(type: string, handler: (event: MessageEvent) => void): void {
      if (type === 'message') messageListeners.delete(handler);
    },
  };

  Object.defineProperty(globalThis, 'self', {
    value: scope,
    configurable: true,
    writable: true,
  });

  parentPort.on('message', dispatchMessage);
}

await import('./gameWorker.ts');