// Compartido entre la tarjeta de subida de imágenes (cliente) y sus acciones
// (servidor).

export type ImageFormState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};

export type ImageFormAction = (
  prev: ImageFormState,
  formData: FormData,
) => Promise<ImageFormState>;
