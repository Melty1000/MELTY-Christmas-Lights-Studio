import { copyTextToClipboard, exportPresetFile } from './presets.ts';
import type { Preset } from '@melty/shared';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${message}\nexpected: ${expectedJson}\nactual:   ${actualJson}`);
}

const originalDocument = globalThis.document;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalSetTimeout = globalThis.setTimeout;

const events: string[] = [];
const timerState: { cleanup?: () => void } = {};

const anchor = {
  href: '',
  download: '',
  style: { display: '' },
  click() {
    events.push(`click:${this.download}:${this.href}`);
  },
};

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement(tag: string) {
      events.push(`createElement:${tag}`);
      assert(tag === 'a', 'export should create an anchor element');
      return anchor;
    },
    body: {
      appendChild(node: typeof anchor) {
        assert(node === anchor, 'export should append the generated anchor');
        events.push(`append:${node.download}:${node.style.display}`);
      },
      removeChild(node: typeof anchor) {
        assert(node === anchor, 'export should remove the generated anchor');
        events.push(`remove:${node.download}`);
      },
    },
  },
});

URL.createObjectURL = ((blob: Blob) => {
  events.push(`createObjectURL:${blob.type}`);
  return 'blob:melty-preset';
}) as typeof URL.createObjectURL;

URL.revokeObjectURL = ((url: string) => {
  events.push(`revoke:${url}`);
}) as typeof URL.revokeObjectURL;

globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
  assert(typeof handler === 'function', 'export cleanup should use a function timer');
  events.push(`setTimeout:${timeout}`);
  timerState.cleanup = handler as () => void;
  return 1;
}) as typeof setTimeout;

try {
  const preset: Preset = {
    id: 'stage-look',
    name: 'Stage Look',
    builtIn: false,
    config: {},
    createdAt: '2026-05-08T00:00:00.000Z',
  };

  const json = exportPresetFile(preset);
  assert(json.includes('"id": "stage-look"'), 'export should return the serialized preset JSON');

  assertEqual(events, [
    'createObjectURL:application/json',
    'createElement:a',
    'append:stage-look.json:none',
    'click:stage-look.json:blob:melty-preset',
    'setTimeout:0',
  ], 'export should append and click the anchor before scheduling cleanup');

  const cleanup = timerState.cleanup;
  assert(cleanup, 'export should defer URL revocation until after the click handler returns');
  cleanup();

  assertEqual(events.slice(-2), [
    'remove:stage-look.json',
    'revoke:blob:melty-preset',
  ], 'export cleanup should remove the anchor and revoke the object URL');
} finally {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  });
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.setTimeout = originalSetTimeout;
}

const writes: string[] = [];
const success = await copyTextToClipboard('{"ok":true}', {
  writeText: async (text: string) => {
    writes.push(text);
  },
});
assert(success, 'copyTextToClipboard should return true when clipboard write succeeds');
assertEqual(writes, ['{"ok":true}'], 'copyTextToClipboard should pass the full text to clipboard.writeText');

const missingClipboard = await copyTextToClipboard('{"ok":true}', undefined);
assert(!missingClipboard, 'copyTextToClipboard should return false when clipboard is unavailable');

const rejected = await copyTextToClipboard('{"ok":true}', {
  writeText: async () => {
    throw new Error('permission denied');
  },
});
assert(!rejected, 'copyTextToClipboard should return false when clipboard write is rejected');
