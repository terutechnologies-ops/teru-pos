// Almacenamiento de archivos públicos (logos; más adelante, fotos de
// productos). Los servicios guardan la ruta, nunca la URL: la URL depende
// del proveedor y se arma con publicUrl().
export interface FileStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  publicUrl(path: string): string;
}
