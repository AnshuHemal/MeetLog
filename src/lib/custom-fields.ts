
export type CustomFieldType = "text" | "number" | "date" | "dropdown" | "url";

export interface CustomFieldDef {

  id: string;

  name: string;

  type: CustomFieldType;

  options?: string[];

  required?: boolean;

  order: number;
}

export interface CustomFieldsConfig {
  fields: CustomFieldDef[];
}

export type CustomFieldValues = Record<string, string | number | null>;

export function parseCustomFieldsConfig(raw: unknown): CustomFieldsConfig {
  if (!raw || typeof raw !== "object") return { fields: [] };
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.fields)) return { fields: [] };
  return { fields: obj.fields as CustomFieldDef[] };
}

export function parseCustomFieldValues(raw: unknown): CustomFieldValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as CustomFieldValues;
}

export function generateFieldId(): string {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text:     "Text",
  number:   "Number",
  date:     "Date",
  dropdown: "Dropdown",
  url:      "URL",
};

export const FIELD_TYPE_ICONS: Record<CustomFieldType, string> = {
  text:     "T",
  number:   "#",
  date:     "📅",
  dropdown: "▾",
  url:      "🔗",
};
