-- Habilita Row Level Security en todas las tablas de la app, sin políticas.
--
-- Este proyecto no usa la API REST de Supabase (PostgREST) ni las llaves
-- anon/authenticated: la aplicación Next.js se conecta directo a Postgres
-- vía Prisma con el rol propietario de las tablas, que RLS no restringe.
-- Sin esto, cualquiera con la publishable key (pública en el frontend)
-- podría leer o modificar estas tablas directamente por la API REST.
ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customer_password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auth_audit_logs" ENABLE ROW LEVEL SECURITY;
