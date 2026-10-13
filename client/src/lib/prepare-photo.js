export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

async function decodePhoto(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file, { imageOrientation: 'from-image' });
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

const encode = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo convertir la foto.')),
    'image/webp', quality);
});

// Normalize the actual image bytes and MIME, remove metadata, and bound the upload.
// Reusable by any future binary photo uploader, without sending the original file.
export async function preparePhoto(file) {
  if (!file?.size || !/^image\//i.test(file.type) || /svg/i.test(file.type)) {
    throw new Error('Selecciona una foto válida, como JPEG, PNG o WebP.');
  }
  let image;
  try { image = await decodePhoto(file); }
  catch { throw new Error('No se pudo abrir esa foto. Prueba con JPEG, PNG o WebP.'); }
  const canvas = document.createElement('canvas');
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('La foto no tiene dimensiones válidas.');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Tu navegador no permite preparar la foto.');
    let scale = Math.min(1, 2048 / Math.max(width, height));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await encode(canvas, Math.max(0.5, 0.85 - attempt * 0.1));
      if (blob.size > 0 && blob.size <= MAX_PHOTO_BYTES &&
          ['image/webp', 'image/png', 'image/jpeg'].includes(blob.type)) return blob;
      scale *= 0.75;
    }
    throw new Error('No se pudo reducir la foto a 2 MB. Prueba con otra imagen.');
  } finally {
    image.close?.();
    canvas.width = 0;
    canvas.height = 0;
  }
}
