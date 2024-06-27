// src/utils.ts

// Función para copiar texto al portapapeles usando la API Clipboard
export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    console.log("Texto copiado al portapapeles: ", text);
  } catch (err) {
    console.error("Error al copiar al portapapeles: ", err);
  }
};
