// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { AiDraftBadge } from './ai-draft-badge';
import { Badge } from './badge';
import { Button } from './button';
import { Dialog, DialogContent, DialogTrigger } from './dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { ToastProvider, useToast } from './toast';
import { Tooltip, TooltipProvider } from './tooltip';

describe('Button', () => {
  it('defaults to type=button so it never submits a form by accident', () => {
    renderWithIntl(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).getAttribute('type')).toBe('button');
  });

  it('fires onClick and respects disabled', () => {
    const onClick = vi.fn();
    renderWithIntl(
      <>
        <Button onClick={onClick}>On</Button>
        <Button disabled onClick={onClick}>
          Off
        </Button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'On' }));
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('badges', () => {
  it('renders children in a badge', () => {
    renderWithIntl(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows the translated AI draft label', () => {
    renderWithIntl(<AiDraftBadge />);
    expect(screen.getByText('AI draft')).toBeTruthy();
  });
});

describe('Dialog', () => {
  it('opens with an accessible name, and closes with Escape', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent title="Approve draft" description="This cannot be undone">
          body text
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve draft' });
    expect(dialog.textContent).toContain('body text');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Tabs', () => {
  it('switches panels and exposes tab semantics', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">First</TabsTrigger>
          <TabsTrigger value="b">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel a</TabsContent>
        <TabsContent value="b">panel b</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('panel a')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByText('panel b')).toBeTruthy();
    expect(screen.queryByText('panel a')).toBeNull();
  });
});

describe('Tooltip', () => {
  it('shows its content on keyboard focus', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Helpful hint">
          <Button>Hover me</Button>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    expect((await screen.findAllByText('Helpful hint')).length).toBeGreaterThan(0);
  });
});

describe('Toast', () => {
  function Trigger() {
    const { toast } = useToast();
    return (
      <Button onClick={() => toast({ title: 'Saved', description: 'Draft stored' })}>Notify</Button>
    );
  }

  it('shows a toast and lets the user dismiss it', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(await screen.findByText('Draft stored')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('Draft stored')).toBeNull());
  });

  it('refuses to be used without a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithIntl(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
