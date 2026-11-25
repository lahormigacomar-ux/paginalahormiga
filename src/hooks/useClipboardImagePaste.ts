import { useEffect, useCallback } from 'react';
import { extractImageFromPasteEvent, ClipboardImageResult } from '../utils/clipboardImage';

export interface UseClipboardImagePasteOptions {
  enabled?: boolean;
  onImagePasted: (base64OrUrl: string, file?: File, result?: ClipboardImageResult) => void;
  // If true, will not trigger if the user is typing inside an <input> or <textarea> (except when pasting an image)
  targetElementRef?: React.RefObject<HTMLElement | null>;
}

export function useClipboardImagePaste({
  enabled = true,
  onImagePasted,
  targetElementRef,
}: UseClipboardImagePasteOptions) {
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      if (!enabled) return;

      // Check if the user is actively typing in a standard text input/textarea and pasting plain text (not image)
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isTextInput = activeTag === 'input' || activeTag === 'textarea';
      
      const hasImage = Array.from(e.clipboardData?.items || []).some(
        item => item.type.startsWith('image/') || item.kind === 'file'
      );

      // If pasting text into a text input, let default behavior happen
      if (isTextInput && !hasImage) {
        return;
      }

      const result = await extractImageFromPasteEvent(e);
      if (result) {
        e.preventDefault();
        e.stopPropagation();
        onImagePasted(result.base64, result.file, result);
      }
    },
    [enabled, onImagePasted]
  );

  useEffect(() => {
    if (!enabled) return;

    const target = targetElementRef?.current || window;
    target.addEventListener('paste', handlePaste as EventListener);

    return () => {
      target.removeEventListener('paste', handlePaste as EventListener);
    };
  }, [enabled, handlePaste, targetElementRef]);
}
