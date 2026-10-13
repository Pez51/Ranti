import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES, preparePhoto } from './prepare-photo';

let bitmap, drawImage, encode;
beforeEach(() => {
  bitmap = { width: 6000, height: 4000, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
    callback(new Blob(['encoded'], { type: 'image/webp' }));
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('decodes and resizes a large original without uploading its original bytes', async () => {
  const original = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' });
  const result = await preparePhoto(original);
  expect(result.type).toBe('image/webp');
  expect(result.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  expect(result).not.toBe(original);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1365);
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('reduces dimensions and quality again if the first output is still too large', async () => {
  encode.mockImplementationOnce(callback => callback(new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type: 'image/webp' })));
  const result = await preparePhoto(new File(['photo'], 'photo.png', { type: 'image/png' }));
  expect(result.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  expect(drawImage).toHaveBeenNthCalledWith(2, bitmap, 0, 0, 1536, 1024);
  expect(encode.mock.calls[1][2]).toBeLessThan(encode.mock.calls[0][2]);
});

it('does not enlarge a small image and accepts a valid browser PNG fallback', async () => {
  bitmap.width = 100; bitmap.height = 80;
  encode.mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })));
  const result = await preparePhoto(new File(['photo'], 'photo.gif', { type: 'image/gif' }));
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 100, 80);
  expect(result.type).toBe('image/png');
});

it.each(['image/svg+xml', 'application/pdf'])('rejects %s without decoding', async type => {
  await expect(preparePhoto(new File(['not a photo'], 'file', { type }))).rejects.toThrow(/foto válida/);
  expect(createImageBitmap).not.toHaveBeenCalled();
});

it('explains corrupt or unsupported photos', async () => {
  createImageBitmap.mockRejectedValue(new Error('decode failed'));
  await expect(preparePhoto(new File(['invalid'], 'photo.heic', { type: 'image/heic' }))).rejects.toThrow(/No se pudo abrir/);
});

it('never returns a photo over the upload limit when encoding cannot reduce it', async () => {
  const tooLarge = new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type: 'image/webp' });
  encode.mockImplementation(callback => callback(tooLarge));
  await expect(preparePhoto(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow(/reducir la foto a 2 MB/);
  expect(encode).toHaveBeenCalledTimes(8);
  expect(bitmap.close).toHaveBeenCalledOnce();
});
