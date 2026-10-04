// Almacenamiento de archivos públicos (logos y fotos de productos). Los
// servicios guardan la ruta, nunca la URL: la URL depende del proveedor y
// se arma con publicUrl().
export interface FileStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  publicUrl(path: string): string;
}

// Almacenamiento privado (recibos de gastos): sin URL pública; se ve con un
// enlace firmado que vence a los `expiresIn` segundos.
export interface PrivateFileStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  signedUrl(path: string, expiresIn: number): Promise<string>;
}
