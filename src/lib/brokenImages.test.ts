import { describe, expect, it, vi } from 'vitest';
import { isLocalAssetUrl, retryBrokenLocalImages } from './brokenImages';

describe('isLocalAssetUrl', () => {
  it('matches http://mdasset.localhost/… URLs', () => {
    expect(isLocalAssetUrl('http://mdasset.localhost/C%3A%5Cdocs%5Ca.png')).toBe(true);
  });

  it('matches mdasset://… URLs', () => {
    expect(isLocalAssetUrl('mdasset://C:/docs/image.png')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isLocalAssetUrl('HTTP://MDASSET.LOCALHOST/x.png')).toBe(true);
    expect(isLocalAssetUrl('MDASSET://x.png')).toBe(true);
  });

  it('rejects remote https:// URLs', () => {
    expect(isLocalAssetUrl('https://example.com/image.png')).toBe(false);
  });

  it('rejects remote http:// URLs', () => {
    expect(isLocalAssetUrl('http://example.com/image.png')).toBe(false);
  });

  it('rejects relative URLs', () => {
    expect(isLocalAssetUrl('images/photo.png')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isLocalAssetUrl('data:image/png;base64,abc123')).toBe(false);
  });
});

describe('retryBrokenLocalImages', () => {
  it('retries a failed local image', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'http://mdasset.localhost/C%3A%5Cdocs%5Ca.png';

    // Stub complete and naturalWidth to simulate a failed image
    Object.defineProperty(img, 'complete', { value: true, writable: false });
    Object.defineProperty(img, 'naturalWidth', { value: 0, writable: false });

    root.appendChild(img);

    // Spy on src setter to detect the retry
    const setSpy = vi.spyOn(img, 'src', 'set');

    const count = retryBrokenLocalImages(root);

    expect(count).toBe(1);
    expect(setSpy).toHaveBeenCalledWith('http://mdasset.localhost/C%3A%5Cdocs%5Ca.png');
  });

  it('does not retry a successfully loaded image', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'http://mdasset.localhost/x.png';

    Object.defineProperty(img, 'complete', { value: true, writable: false });
    Object.defineProperty(img, 'naturalWidth', { value: 100, writable: false });

    root.appendChild(img);

    const setSpy = vi.spyOn(img, 'src', 'set');
    const count = retryBrokenLocalImages(root);

    expect(count).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('does not retry an image that is still loading', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'http://mdasset.localhost/x.png';

    Object.defineProperty(img, 'complete', { value: false, writable: false });
    Object.defineProperty(img, 'naturalWidth', { value: 0, writable: false });

    root.appendChild(img);

    const setSpy = vi.spyOn(img, 'src', 'set');
    const count = retryBrokenLocalImages(root);

    expect(count).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('does not retry a failed remote image', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'https://example.com/photo.png';

    Object.defineProperty(img, 'complete', { value: true, writable: false });
    Object.defineProperty(img, 'naturalWidth', { value: 0, writable: false });

    root.appendChild(img);

    const setSpy = vi.spyOn(img, 'src', 'set');
    const count = retryBrokenLocalImages(root);

    expect(count).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('handles mdasset:// scheme as local', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'mdasset://C:/docs/image.png';

    Object.defineProperty(img, 'complete', { value: true, writable: false });
    Object.defineProperty(img, 'naturalWidth', { value: 0, writable: false });

    root.appendChild(img);

    const setSpy = vi.spyOn(img, 'src', 'set');
    const count = retryBrokenLocalImages(root);

    expect(count).toBe(1);
    expect(setSpy).toHaveBeenCalled();
  });

  it('returns the count of retried images', () => {
    const root = document.createElement('div');

    // Failed local image
    const img1 = document.createElement('img');
    img1.src = 'http://mdasset.localhost/a.png';
    Object.defineProperty(img1, 'complete', { value: true, writable: false });
    Object.defineProperty(img1, 'naturalWidth', { value: 0, writable: false });
    root.appendChild(img1);

    // Loaded image
    const img2 = document.createElement('img');
    img2.src = 'http://mdasset.localhost/b.png';
    Object.defineProperty(img2, 'complete', { value: true, writable: false });
    Object.defineProperty(img2, 'naturalWidth', { value: 100, writable: false });
    root.appendChild(img2);

    // Failed remote image
    const img3 = document.createElement('img');
    img3.src = 'https://example.com/c.png';
    Object.defineProperty(img3, 'complete', { value: true, writable: false });
    Object.defineProperty(img3, 'naturalWidth', { value: 0, writable: false });
    root.appendChild(img3);

    const count = retryBrokenLocalImages(root);

    expect(count).toBe(1);
  });

  it('ignores images with empty src', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = '';

    Object.defineProperty(img, 'complete', { value: true, writable: false });
    Object.defineProperty(img, 'naturalWidth', { value: 0, writable: false });

    root.appendChild(img);

    const setSpy = vi.spyOn(img, 'src', 'set');
    const count = retryBrokenLocalImages(root);

    expect(count).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
