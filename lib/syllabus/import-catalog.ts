/**
 * SYL-IMPORT-1: the taxonomy TOPIC catalog the import preview resolves against (hierarchy path = the contract's stable
 * topic identifier), read with the CALLER's session client (admin / staff RLS read policy). Read-only; null on error.
 */
import type { ImportCatalogTopic } from "@/lib/syllabus/import-contract";
import type { AppSupabaseClient } from "@/lib/supabase/types";

export async function loadImportCatalog(supabase: AppSupabaseClient): Promise<ImportCatalogTopic[] | null> {
  try {
    const { data, error } = await supabase.from("canonical_taxonomy_nodes").select("id, hierarchy_path, name, is_active").eq("node_type", "TOPIC");
    if (error) return null;
    return (data ?? []).map((t) => ({ id: t.id, path: t.hierarchy_path, name: t.name, is_active: t.is_active }));
  } catch {
    return null;
  }
}
