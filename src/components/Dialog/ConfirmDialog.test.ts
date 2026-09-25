import { describe, expect, it } from 'vitest';
import { useDialogStore } from './ConfirmDialog';

describe('useDialogStore', () => {
  it('resolves the first request with null when a second show() bumps it out', async () => {
    const first = useDialogStore.getState().show('First', 'm', [{ id: 'ok', label: 'OK' }]);
    const second = useDialogStore.getState().show('Second', 'm', [{ id: 'ok', label: 'OK' }]);

    expect(useDialogStore.getState().current?.title).toBe('Second');
    expect(await first).toBeNull();

    useDialogStore.getState().close('ok');
    expect(await second).toBe('ok');
    expect(useDialogStore.getState().current).toBeNull();
  });

  it('resolves with the chosen button id and clears current', async () => {
    const request = useDialogStore.getState().show('Title', 'm', [{ id: 'yes', label: 'Yes' }]);
    useDialogStore.getState().close('yes');
    expect(await request).toBe('yes');
    expect(useDialogStore.getState().current).toBeNull();
  });
});
