import type { RecipeField } from "@/server/services/recipes";

// Compartido entre los formularios de la receta (cliente) y sus acciones
// (servidor).

export type RecipeFormValues = Record<RecipeField, string>;

export type RecipeFormState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  fieldErrors: Partial<Record<RecipeField, string>>;
  values: RecipeFormValues;
};

export type RecipeAction = (
  prev: RecipeFormState,
  formData: FormData,
) => Promise<RecipeFormState>;

export function readRecipeForm(formData: FormData): RecipeFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return { supplyId: field("supplyId"), quantity: field("quantity"), unit: field("unit") };
}

export function recipeFormState(values: RecipeFormValues): RecipeFormState {
  return { status: "idle", message: null, fieldErrors: {}, values };
}
