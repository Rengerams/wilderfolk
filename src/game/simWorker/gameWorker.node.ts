/**
 * Node worker_threads entry — polyfills `self` before loading the shared worker module.
 */
import { isMainThread, parentPort } from 'node:worker_threads';
import { WORKER_PROTO, type WorkerResponse } from './protocol';

function postStartupError(message: string): void {
  if (!parentPort) return;
  const response: WorkerResponse = {
    type: 'error',
    proto: WORKER_PROTO,
    message,
    source: 'general',
  };
  parentPort.postMessage(response);
}

if (!isMainThread && parentPort) {
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  const messageListeners = new Set<(event: MessageEvent) => void>();

  const dispatchMessage = (data: unknown): void => {
    const event = { data, target: scope, currentTarget: scope, ports: [] } as unknown as MessageEvent;
    messageHandler?.(event);
    for (const listener of messageListeners) listener(event);
  };

  const scope = new Proxy(globalThis, {
    get(target, prop, receiver) {
      if (prop === 'postMessage') {
        return (message: unknown, transfer?: Transferable[]) => {
          parentPort!.postMessage(message, transfer as never);
        };
      }
      if (prop === 'onmessage') return messageHandler;
      if (prop === 'addEventListener') {
        return (type: string, handler: (event: MessageEvent) => void) => {
          if (type === 'message') messageListeners.add(handler);
        };
      }
      if (prop === 'removeEventListener') {
        return (type: string, handler: (event: MessageEvent) => void) => {
          if (type === 'message') messageListeners.delete(handler);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop === 'onmessage') {
        messageHandler = value as ((event: MessageEvent) => void) | null;
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });

  Object.defineProperty(globalThis, 'self', {
    value: scope,
    configurable: true,
    writable: true,
  });

  parentPort.on('message', dispatchMessage);
}

try {
  // gameWorker.ts installs the canonical bundled dialogue bank synchronously.
  // Avoid the disk preload here: it adds variable startup I/O to the Node
  // transport adapter without changing the authoritative worker state.
  await import('./gameWorker.ts');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[gameWorker.node] Startup failed:', message);
  postStartupError(`Worker startup failed: ${message}`);
  throw err;
}