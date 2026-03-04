export const dataUrlToFile = (dataUrl: string, filename = "reference.png") => {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64);
  const length = binary.length;
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new File([buffer], filename, { type: mime });
};

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });

