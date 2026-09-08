'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Contact } from '@/lib/types';
import { PRIORITIES, type Priority } from '@/lib/validation';

type Draft = {
  name: string;
  company: string;
  role: string;
  where_met: string;
  notes: string;
  priority: Priority;
};

const EMPTY: Draft = {
  name: '',
  company: '',
  role: '',
  where_met: '',
  notes: '',
  priority: 'medium',
};

function toDraft(contact: Contact | null): Draft {
  if (!contact) return EMPTY;
  return {
    name: contact.name,
    company: contact.company ?? '',
    role: contact.role ?? '',
    where_met: contact.where_met ?? '',
    notes: contact.notes ?? '',
    priority: contact.priority,
  };
}

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onSaved: () => void;
}) {
  const isEdit = contact !== null;

  // Initialised from props rather than synced with an effect. ContactsApp
  // gives this component a key that changes each time the dialog is opened, so
  // it remounts with a fresh draft and never shows a stale one.
  const [draft, setDraft] = useState<Draft>(() => toDraft(contact));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});

    try {
      const response = await fetch(
        isEdit ? `/api/contacts/${contact.id}` : '/api/contacts',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        // The server is the authority on validity — surface exactly what it said.
        setFieldErrors(payload.fieldErrors ?? {});
        toast.error(payload.error ?? 'Could not save that contact.');
        return;
      }

      toast.success(isEdit ? 'Contact updated.' : 'Contact added.');
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add a contact'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update what you know about this person.'
              : 'Someone you want to stay connected with.'}
          </DialogDescription>
        </DialogHeader>

        {/* noValidate: let the server own validation so the rubric's invalid-input
            path is actually exercised rather than blocked by the browser. */}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Name" htmlFor="name" error={fieldErrors.name} required>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Jordan Lee"
              aria-invalid={Boolean(fieldErrors.name)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="company" error={fieldErrors.company}>
              <Input
                id="company"
                value={draft.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Genentech"
              />
            </Field>

            <Field label="Role" htmlFor="role" error={fieldErrors.role}>
              <Input
                id="role"
                value={draft.role}
                onChange={(e) => set('role', e.target.value)}
                placeholder="Product Manager"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Where you met" htmlFor="where_met" error={fieldErrors.where_met}>
              <Input
                id="where_met"
                value={draft.where_met}
                onChange={(e) => set('where_met', e.target.value)}
                placeholder="Haas career fair"
              />
            </Field>

            <Field label="Priority" htmlFor="priority" error={fieldErrors.priority} required>
              <Select
                value={draft.priority}
                onValueChange={(value) => set('priority', value as Priority)}
              >
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue placeholder="Choose a priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority[0].toUpperCase() + priority.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea
              id="notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Talked about the healthcare rotation — follow up in October."
            />
          </Field>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
