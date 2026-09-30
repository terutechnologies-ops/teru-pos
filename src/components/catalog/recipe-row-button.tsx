"use client";

import { Trash2 } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { recipeRowAction } from "./recipe-actions";

export function RecipeRowButton({
  companySlug,
  id,
  supplyName,
}: {
  companySlug: string;
  id: string;
  supplyName: string;
}) {
  return (
    <RowActionButton
      action={recipeRowAction}
      companySlug={companySlug}
      intent="remove"
      id={id}
      subject={`${supplyName} de la receta`}
      label="Quitar"
      icon={Trash2}
      variant="ghost"
      destructive
    />
  );
}
