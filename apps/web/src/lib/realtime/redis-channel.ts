// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** Redis pub/sub channel for a client-facing channel name; namespaced so it cannot collide with BullMQ keys. */
export const redisChannel = (channel: string): string => `em:rt:${channel}`;
