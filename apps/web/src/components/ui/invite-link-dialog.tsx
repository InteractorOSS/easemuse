// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent } from './dialog';
import { useToast } from './toast';

export interface InviteLink {
  email: string;
  url: string;
}

/**
 * Shows a just-created invitation link once, to copy and pass on (chat, a call) when outgoing
 * email is not set up. Only the token's hash is stored, so the link cannot be shown again.
 */
export function InviteLinkDialog({
  link,
  onClose,
}: {
  link: InviteLink | null;
  onClose: () => void;
}) {
  const t = useTranslations('common.inviteLink');
  const { toast } = useToast();
  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {link ? (
        <DialogContent title={t('title')} description={t('description', { email: link.email })}>
          <div className="flex flex-col gap-3">
            <input
              readOnly
              aria-label={t('title')}
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 rounded-md border border-border bg-surface px-2 text-xs"
            />
            <p className="text-xs text-muted">{t('note')}</p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link.url).catch(() => undefined);
                  toast({ title: t('copied') });
                }}
              >
                {t('copy')}
              </Button>
              <DialogClose asChild>
                <Button>{t('close')}</Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
