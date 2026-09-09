'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ContactDialog } from '@/components/contact-dialog';
import { SignOutButton } from '@/components/sign-out-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Contact, SortDirection, SortField } from '@/lib/types';
import type { Priority } from '@/lib/validation';

type Status = 'loading' | 'ready' | 'error';

type FetchResult =
  | { ok: true; contacts: Contact[] }
  | { ok: false; error: string };

/**
 * Pure data fetch — deliberately holds no React state. State is applied by the
 * caller inside a promise callback, which keeps the effect body free of
 * synchronous setState calls and lets stale responses be discarded.
 */
async function fetchContacts(params: URLSearchParams): Promise<FetchResult> {
  try {
    const response = await fetch(`/api/contacts?${params}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: payload.error ?? 'Could not load your contacts.' };
    }
    return { ok: true, contacts: payload.contacts ?? [] };
  } catch {
    return {
      ok: false,
      error: 'Could not reach the server. Check your connection and try again.',
    };
  }
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'border-transparent bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  medium:
    'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
};

/** Labels the <Select> triggers display; Base UI otherwise shows the raw value. */
const PRIORITY_FILTER_LABELS: Record<'all' | Priority, string> = {
  all: 'All priorities',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SORT_LABELS: Record<SortField, string> = {
  created_at: 'Date added',
  name: 'Name',
  company: 'Company',
  priority: 'Priority',
};

export function ContactsApp({
  userEmail,
  userName,
}: {
  userEmail: string;
  userName: string | null;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sort, setSort] = useState<SortField>('created_at');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  // Bumped on every open so ContactDialog remounts with a fresh draft rather
  // than syncing its state from props in an effect.
  const [dialogSeq, setDialogSeq] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openDialog = useCallback((contact: Contact | null) => {
    setEditing(contact);
    setDialogSeq((n) => n + 1);
    setDialogOpen(true);
  }, []);

  /**
   * Filter and sort changes go through here so the "loading" state is set in
   * the event handler that caused it. Setting it inside the fetch effect
   * instead would be a synchronous setState in an effect body, which triggers
   * a cascading render.
   */
  const startLoading = useCallback(() => setStatus('loading'), []);

  /** Re-runs the fetch effect after a save or delete. */
  const refresh = useCallback(() => {
    setStatus('loading');
    setRefreshKey((n) => n + 1);
  }, []);

  // Don't fire a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * Refetch on mount, whenever the sort/filter/search inputs change, and
   * whenever `refreshKey` is bumped after a save or delete.
   *
   * The `cancelled` flag discards a response that arrives after a newer
   * request has already been issued — without it, a slow early keystroke could
   * overwrite the results of a later one.
   */
  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ sort, dir: direction });
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());

    void fetchContacts(params).then((result) => {
      if (cancelled) return;

      if (result.ok) {
        setContacts(result.contacts);
        setErrorMessage(null);
        setStatus('ready');
      } else {
        setErrorMessage(result.error);
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sort, direction, priorityFilter, debouncedSearch, refreshKey]);

  async function onDelete(contact: Contact) {
    if (!window.confirm(`Delete ${contact.name}? This cannot be undone.`)) return;

    setDeletingId(contact.id);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.error ?? 'Could not delete that contact.');
        return;
      }

      toast.success(`Deleted ${contact.name}.`);
      refresh();
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  }

  const hasFilters = priorityFilter !== 'all' || debouncedSearch.trim() !== '';

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold sm:text-xl">Networking Tracker</h1>
            <p className="truncate text-sm text-muted-foreground">
              Signed in as {userName ?? userEmail}
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-medium">
            {status === 'ready'
              ? `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`
              : 'Your contacts'}
          </h2>
          <Button onClick={() => openDialog(null)}>Add contact</Button>
        </div>

        {/* Controls: stack on mobile, sit inline from sm up. */}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              startLoading();
            }}
            placeholder="Search name, company, role, or where you met…"
            aria-label="Search contacts"
          />

          <Select
            value={priorityFilter}
            items={PRIORITY_FILTER_LABELS}
            onValueChange={(value) => {
              setPriorityFilter(value as 'all' | Priority);
              startLoading();
            }}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            items={SORT_LABELS}
            onValueChange={(value) => {
              setSort(value as SortField);
              startLoading();
            }}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
                <SelectItem key={field} value={field}>
                  {SORT_LABELS[field]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => {
              setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
              startLoading();
            }}
            aria-label={`Sort ${direction === 'asc' ? 'ascending' : 'descending'}, click to reverse`}
          >
            {direction === 'asc' ? '↑ Asc' : '↓ Desc'}
          </Button>
        </div>

        {status === 'loading' ? <LoadingState /> : null}

        {status === 'error' ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{errorMessage}</span>
              <Button size="sm" variant="outline" onClick={refresh}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {status === 'ready' && contacts.length === 0 ? (
          <EmptyState
            hasFilters={hasFilters}
            onClear={() => {
              setPriorityFilter('all');
              setSearch('');
              startLoading();
            }}
            onAdd={() => openDialog(null)}
          />
        ) : null}

        {status === 'ready' && contacts.length > 0 ? (
          <>
            {/* Mobile: cards. Desktop: table. */}
            <div className="grid gap-3 sm:hidden">
              {contacts.map((contact) => (
                <MobileCard
                  key={contact.id}
                  contact={contact}
                  deleting={deletingId === contact.id}
                  onEdit={() => openDialog(contact)}
                  onDelete={() => void onDelete(contact)}
                />
              ))}
            </div>

            <Card className="hidden overflow-hidden py-0 sm:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Where met</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">
                          {contact.name}
                          {contact.notes ? (
                            <p className="max-w-xs truncate text-xs text-muted-foreground">
                              {contact.notes}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>{contact.company ?? <Dash />}</TableCell>
                        <TableCell>{contact.role ?? <Dash />}</TableCell>
                        <TableCell>{contact.where_met ?? <Dash />}</TableCell>
                        <TableCell>
                          <PriorityBadge priority={contact.priority} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(contact)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={deletingId === contact.id}
                            onClick={() => void onDelete(contact)}
                          >
                            {deletingId === contact.id ? 'Deleting…' : 'Delete'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        ) : null}
      </main>

      <ContactDialog
        key={`${editing?.id ?? 'new'}-${dialogSeq}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editing}
        onSaved={refresh}
      />
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge className={PRIORITY_STYLES[priority]}>
      {priority[0].toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading contacts">
      {[0, 1, 2].map((row) => (
        <Card key={row}>
          <CardContent className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
  onAdd,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="text-base font-medium">
          {hasFilters ? 'No contacts match those filters' : 'No contacts yet'}
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {hasFilters
            ? 'Try a different search term or clear the priority filter.'
            : 'Add the first person you want to stay connected with at Berkeley.'}
        </p>
        {hasFilters ? (
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        ) : (
          <Button onClick={onAdd}>Add your first contact</Button>
        )}
      </CardContent>
    </Card>
  );
}

function MobileCard({
  contact,
  deleting,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const subtitle = [contact.role, contact.company].filter(Boolean).join(' · ');

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{contact.name}</p>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <PriorityBadge priority={contact.priority} />
        </div>

        {contact.where_met ? (
          <p className="text-sm text-muted-foreground">Met at {contact.where_met}</p>
        ) : null}
        {contact.notes ? <p className="text-sm">{contact.notes}</p> : null}

        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
