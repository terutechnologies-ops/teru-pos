"use client";

import { ImageUploadCard } from "@/components/shared/image-upload-card";

import { removeProductImageAction, uploadProductImageAction } from "./product-image-actions";
import { ProductThumb } from "./product-thumb";

export function ProductImageCard({
  companySlug,
  productId,
  productName,
  imageUrl,
}: {
  companySlug: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
}) {
  return (
    <ImageUploadCard
      title="Foto"
      description="Se verá en la lista y al vender. Puedes subir la foto del celular: se reduce antes de enviarla."
      preview={<ProductThumb imageUrl={imageUrl} productName={productName} size="lg" />}
      hasImage={Boolean(imageUrl)}
      hiddenFields={{ company: companySlug, id: productId }}
      uploadAction={uploadProductImageAction}
      removeAction={removeProductImageAction}
      labels={{ upload: "Subir foto", change: "Cambiar foto", remove: "Quitar foto" }}
    />
  );
}
