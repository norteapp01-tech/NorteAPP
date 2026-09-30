const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Redimensiona (maior lado até 1280px) e recomprime como JPEG antes de virar
 * base64 — uma foto de câmera real chega em vários MB, e mandar isso cru no
 * corpo da requisição pra OpenAI é lento e caro à toa. Canvas API nativa, sem
 * lib nova.
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível pra processar a imagem.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<string>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Não foi possível processar a imagem."));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
