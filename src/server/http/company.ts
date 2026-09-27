import "server-only";

import { cache } from "react";

import { getActiveCompanyBySlug } from "@/server/services/companies";

// cache(): los metadatos del layout y la página comparten una sola consulta
// por request.
export const getRequestCompany = cache(getActiveCompanyBySlug);
