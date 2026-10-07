// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import common from '../../messages/en/common.json';
import home from '../../messages/en/home.json';
import nav from '../../messages/en/nav.json';
import workbench from '../../messages/en/workbench.json';
import email from '../../messages/en/email.json';
import admin from '../../messages/en/admin.json';
import members from '../../messages/en/members.json';

export const messages = { common, nav, home, workbench, email, admin, members };

/** Renders with the English catalogs, as the app does. */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
