/** True for URLs served by the local mdasset protocol; remote images are never retried. */
export function isLocalAssetUrl(src: string): boolean {
  return /^(?:http:\/\/mdasset\.localhost\/|mdasset:\/\/)/i.test(src);
}

/** Refetches failed local images under root. React doesn't re-apply identical HTML, so a
 * failed <img> would otherwise stay broken after the file appears. Returns how many were retried. */
export function retryBrokenLocalImages(root: ParentNode): number {
  let count = 0;
  for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
    if (img.complete && img.naturalWidth === 0 && img.src && isLocalAssetUrl(img.src)) {
      const src = img.src;
      img.src = src;
      count++;
    }
  }
  return count;
}
