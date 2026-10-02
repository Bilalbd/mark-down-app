import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { stacksUseFamily } from '@/lib/fonts';
import { useFontsStore } from '@/store/fonts';
import { useStyleStore } from '@/store/style';

/**
 * Removes a downloaded Google font, first asking if the active preset's body, heading or code font
 * is that family (the preset keeps its stack, so the text falls back until a new font is chosen).
 * Resolves to false if the user cancels; rejects with the failure if the removal itself fails.
 * `onRemoving` runs once the removal is about to start (after any confirmation).
 */
export async function removeDownloadedFontConfirmed(
  font: { id: string; family: string },
  onRemoving?: () => void,
): Promise<boolean> {
  const preset = useStyleStore.getState().active();
  const t = preset.typography;
  if (stacksUseFamily([t.bodyFont, t.headingFont, t.monoFont], font.family)) {
    const choice = await useDialogStore
      .getState()
      .show(
        `Remove ${font.family}?`,
        `The "${preset.name}" preset uses this font. It will fall back to another font until you choose a new one.`,
        [
          { id: 'remove', label: 'Remove', danger: true },
          { id: 'cancel', label: 'Cancel', primary: true },
        ],
      );
    if (choice !== 'remove') return false;
  }
  onRemoving?.();
  await useFontsStore.getState().remove(font.id);
  return true;
}
