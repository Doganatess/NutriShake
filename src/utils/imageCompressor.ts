export interface CompressedImageResult {
  base64Data: string; // pure base64 for API inlineData
  dataUrl: string; // for <img> src preview
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Resizes and compresses an uploaded image file down to max 1024x1024
 * with 0.8 JPEG quality to optimize network transfer and Vision AI processing.
 */
export async function compressImage(
  file: File | Blob,
  maxDimension: number = 1024,
  quality: number = 0.82
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Fill white background for transparent PNGs
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64Data = dataUrl.split(',')[1] || '';

        // Approximate size
        const sizeBytes = Math.round((base64Data.length * 3) / 4);

        resolve({
          base64Data,
          dataUrl,
          mimeType,
          width,
          height,
          sizeBytes,
        });
      };

      img.onerror = () => {
        reject(new Error('Görsel dosyası okunamadı veya bozuk.'));
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Görsel yüklenirken bir okuma hatası oluştu.'));
    };

    reader.readAsDataURL(file);
  });
}
