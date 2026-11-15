import { createServiceClient } from "@/lib/supabase";

export const supabase = createServiceClient();

export default {
  supabase,
  from: (table: string) => supabase.from(table),
  prepare: (query: string) => ({
    run: (...args: any[]) => {
      // Compatibilidade com interface do better-sqlite3
      return { changes: 0, lastInsertRowid: null };
    },
    get: (...args: any[]) => null,
    all: (...args: any[]) => [],
  }),
};
