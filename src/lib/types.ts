import type { Priority } from '@/lib/validation';

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  where_met: string | null;
  notes: string | null;
  priority: Priority;
  priority_rank: number;
  created_at: string;
  updated_at: string;
};

/** Columns a client is allowed to sort by, and the SQL column each maps to. */
export const SORT_FIELDS = {
  name: 'name',
  company: 'company',
  priority: 'priority_rank',
  created_at: 'created_at',
} as const;

export type SortField = keyof typeof SORT_FIELDS;
export type SortDirection = 'asc' | 'desc';
