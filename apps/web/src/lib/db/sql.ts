// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { Prisma } from '@prisma/client';

/**
 * Building blocks for raw SQL inside a scoped transaction (full-text search and similar). Values
 * given to `sql` are always sent as parameters, never joined into the text. Raw queries run on the
 * scoped connection, so the tenant policy applies to them like to any other query (ADR-001).
 */
export const sql = Prisma.sql;
export const joinSql = Prisma.join;
export const emptySql = Prisma.empty;
export type Sql = Prisma.Sql;
