const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

// Saha fotografi / ticket eki / kalite kontrol fotografi upload noktalarinda
// yuklemeden once cagrilir. Storage 1 GB limitli (ucretsiz Supabase plani) -
// sikistirma olmadan telefon fotograflari birkac haftada dolduruyordu.
// PDF ve diger raster-olmayan formatlar (svg, gif) dokunulmadan gecer.
export async function compressImageFile(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file
  }

  try {
    const img = await loadImage(file)
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
    const targetWidth = Math.round(img.width * scale)
    const targetHeight = Math.round(img.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    canvas.getContext('2d').drawImage(img, 0, 0, targetWidth, targetHeight)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (e) {
    console.error('Foto sikistirma basarisiz, orijinal dosya yuklenecek:', e)
    return file
  }
}
