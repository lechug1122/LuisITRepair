function dataUrlToFile(dataUrl, filename = "ticket.png") {
  const safeDataUrl = String(dataUrl || "");
  const [header, base64] = safeDataUrl.split(",");
  if (!header || !base64) {
    throw new Error("No se pudo preparar la imagen del ticket.");
  }

  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mimeType = mimeMatch?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], filename, { type: mimeType });
}

export async function shareTicketImageDataUrl({
  imageDataUrl,
  filename = "ticket.png",
  title = "Ticket",
  text = "",
} = {}) {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (typeof navigator.share !== "function") return false;

  const file = dataUrlToFile(imageDataUrl, filename);
  const payload = { files: [file], title: String(title || "").trim(), text: String(text || "").trim() };

  if (typeof navigator.canShare === "function" && !navigator.canShare({ files: payload.files })) {
    return false;
  }

  await navigator.share(payload);
  return true;
}

export function openTicketImageDataUrl(imageDataUrl, title = "Ticket") {
  if (typeof window === "undefined") return false;

  const popup = window.open("", "_blank");
  if (!popup) return false;

  popup.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${String(title || "Ticket")}</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: #f5f5f5;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
          }
          img {
            display: block;
            width: min(100%, 480px);
            height: auto;
            background: #fff;
          }
        </style>
      </head>
      <body>
        <img src="${String(imageDataUrl || "")}" alt="${String(title || "Ticket")}" />
      </body>
    </html>
  `);
  popup.document.close();
  return true;
}
