-- Completa el bloqueo de acceso público: _prisma_migrations también vive
-- en el schema "public" y quedaba expuesta a la API REST de Supabase.
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
