/**
 * PMG GmbH - Client-side Image Compression & Preview Utility
 * 
 * Tömöríti a feltöltött képeket HTML5 Canvas segítségével 1600px max méretre
 * és ~80%-os JPEG minőségre. Ezzel a 10-15MB-os fotók ~300KB-osak lesznek,
 * megszüntetve a Netlify 6MB-os korlátját és a timeout hibákat.
 */

window.compressImageFile = async function compressImageFile(file, options = {}) {
  const { maxWidth = 1600, maxHeight = 1600, quality = 0.82 } = options;

  if (!file) return null;

  // Ha nem kép (pl. PDF), nem nyúlunk hozzá
  const isImage = file.type?.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(file.name);
  if (!isImage) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    
    // Ha a FileReader elhasal (pl elavult mobil), az eredeti fájlt adjuk vissza
    reader.onerror = () => resolve(file);

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width <= 0 || height <= 0) {
          resolve(file);
          return;
        }

        // Méretezés kiszámítása a képarány megtartásával
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Fehér háttér átlátszó PNG/BMP képekhez
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // Új fájlnév generálása (.jpg)
            const origBase = file.name.replace(/\.[^.]+$/, '');
            const newFileName = `${origBase}.jpg`;

            const compressedFile = new File([blob], newFileName, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });

            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Formázza a fájlméretet olvasható formátumba (pl. 8.4 MB vagy 280 KB)
 */
window.formatFileSize = function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
