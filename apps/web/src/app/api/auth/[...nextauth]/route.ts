// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: public
// rate-limit: exempt (Auth.js OIDC redirect and callback endpoints; abuse limits belong at the edge)
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
