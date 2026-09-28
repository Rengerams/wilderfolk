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
  try {
    parentPort.postMessage(response);
  } catch {
    /* ignore port write failure during fatal shutdown */
  }
}

let workerLoaded = false;
const queuedMessages: unknown[] = [];

if (!isMainThread && parentPort) {
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  let errorHandler: ((event: ErrorEvent) => void) | null = null;
  let unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  const messageListeners = new Set<(event: MessageEvent) => void>();
  const errorListeners = new Set<(event: ErrorEvent) => void>();

  const deliverMessage = (data: unknown): void => {
    const event = { data, target: scope, currentTarget: scope, ports: [] } as unknown as MessageEvent;
    try {
      messageHandler?.(event);
      for (const listener of messageListeners) listener(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postStartupError(`Message processing failed: ${message}`);
    }
  };

  const dispatchMessage = (data: unknown): void => {
    if (!workerLoaded) {
      queuedMessages.push(data);
      return;
    }
    deliverMessage(data);
  };

  const postMessagePolyfill = (message: unknown, transfer?: Transferable[]): void => {
    if (!parentPort) return;
    // Filter out detached ArrayBuffers to prevent Node ERR_INVALID_TRANSFER_OBJECT
    const validTransfer = transfer?.filter(
      (t): t is Transferable => !(t instanceof ArrayBuffer && t.byteLength === 0),
    );
    try {
      parentPort.postMessage(message, validTransfer as never);
    } catch (err) {
      console.warn('[gameWorker.node] postMessage transfer failed, falling back to clone', err);
      parentPort.postMessage(message);
    }
  };

  const scope = new Proxy(globalThis, {
    get(target, prop, receiver) {
      if (prop === 'postMessage') return postMessagePolyfill;
      if (prop === 'onmessage') return messageHandler;
      if (prop === 'onerror') return errorHandler;
      if (prop === 'onunhandledrejection') return unhandledRejectionHandler;
      if (prop === 'close') return () => process.exit(0);

      if (prop === 'addEventListener') {
        return (type: string, handler: (event: any) => void) => {
          if (type === 'message') messageListeners.add(handler);
          else if (type === 'error') errorListeners.add(handler);
        };
      }
      if (prop === 'removeEventListener') {
        return (type: string, handler: (event: any) => void) => {
          if (type === 'message') messageListeners.delete(handler);
          else if (type === 'error') errorListeners.delete(handler);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop === 'onmessage') {
        messageHandler = value as ((event: MessageEvent) => void) | null;
        return true;
      }
      if (prop === 'onerror') {
        errorHandler = value as ((event: ErrorEvent) => void) | null;
        return true;
      }
      if (prop === 'onunhandledrejection') {
        unhandledRejectionHandler = value as ((event: PromiseRejectionEvent) => void) | null;
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

  // Also expose global postMessage if scripts call it without self.
  (globalThis as unknown as { postMessage: unknown }).postMessage = postMessagePolyfill;

  // Bridge Node process-level errors into the worker error handlers
  process.on('uncaughtException', (err: Error) => {
    const errorEvent = {
      message: err.message,
      filename: err.stack ?? 'unknown',
      lineno: 0,
      colno: 0,
    } as unknown as ErrorEvent;

    if (errorHandler) {
      errorHandler(errorEvent);
    }
    for (const listener of errorListeners) {
      listener(errorEvent);
    }
    if (!errorHandler && errorListeners.size === 0) {
      postStartupError(`Uncaught exception: ${err.message}`);
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const rejectionEvent = { reason } as unknown as PromiseRejectionEvent;
    if (unhandledRejectionHandler) {
      unhandledRejectionHandler(rejectionEvent);
    } else {
      postStartupError(`Unhandled rejection: ${(reason as Error)?.message ?? String(reason)}`);
    }
  });

  parentPort.on('message', dispatchMessage);

  async function bootstrapWorker(): Promise<void> {
    try {
      // Robust multi-extension import (supports tsx, ts-node, and compiled dist/.js)
      try {
        await import('./gameWorker');
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'ERR_MODULE_NOT_FOUND') {
          try {
            await import('./gameWorker.js');
          } catch {
            await import('./gameWorker.ts');
          }
        } else {
          throw err;
        }
      }

      workerLoaded = true;
      for (const data of queuedMessages.splice(0)) {
        deliverMessage(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[gameWorker.node] Startup failed:', message);
      postStartupError(`Worker startup failed: ${message}`);
      throw err;
    }
  }

  void bootstrapWorker();
}