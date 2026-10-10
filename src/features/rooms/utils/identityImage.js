export async function prepareMobilePhoto(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Each original photo must be 10 MB or smaller.');
  const heic = /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');
  if (!heic && (!file.type.startsWith('image/') || /svg/i.test(file.type))) {
    throw new Error('Choose a photo such as JPEG, PNG, WebP, AVIF, GIF, BMP or HEIC.');
  }
  let photo = file;
  try {
    if (heic) {
      const { default: convert } = await import('heic2any');
      const result = await convert({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      photo = Array.isArray(result) ? result[0] : result;
    }
    const decoded = await createImageBitmap(photo);
    if (decoded.width * decoded.height > 64000000) { decoded.close(); throw new Error('Photo resolution is too large.'); }
    decoded.close();
    return photo;
  } catch (error) {
    if (/resolution/.test(error.message || '')) throw error;
    throw new Error('This photo format cannot be opened. Export it as JPEG or take a new photo.');
  }
}

export const TARGET_IMAGE_BYTES = 450 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;

export function cropPixels(width, height, crop = { x: 0, y: 0, width: 1, height: 1 }) {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (!values.every(Number.isFinite) || crop.x < 0 || crop.y < 0 ||
      crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) {
    throw new Error('Please select a crop inside the image.');
  }
  const x = Math.min(width - 1, Math.floor(crop.x * width));
  const y = Math.min(height - 1, Math.floor(crop.y * height));
  return { x, y, width: Math.min(width - x, Math.max(1, Math.round(crop.width * width))),
    height: Math.min(height - y, Math.max(1, Math.round(crop.height * height))) };
}

export async function compressIdentityImage(file, crop) {
  if (!file.type.startsWith('image/') || /svg|heic|heif/i.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Each original photo must be 10 MB or smaller.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 64000000) throw new Error('Photo resolution is too large.');
    const area = cropPixels(bitmap.width, bitmap.height, crop);
    let smallest;
    // Prefer readable resolution; reduce dimensions only when quality alone
    // cannot meet the target. Keep the existing private bucket's 1 MB hard cap.
    for (const maxEdge of [1500, 1250, 1000]) {
      const scale = Math.min(1, maxEdge / Math.max(area.width, area.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(area.width * scale));
      canvas.height = Math.max(1, Math.round(area.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot process this photo.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.76, 0.66, 0.56]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob || blob.size === 0) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= TARGET_IMAGE_BYTES) return blob;
      }
    }
    if (smallest && smallest.size <= MAX_IMAGE_BYTES) return smallest;
    throw new Error('Photo cannot be compressed below 1 MB. Choose a smaller photo.');
  } finally { bitmap.close(); }
}
