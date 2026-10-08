-- T-5-02 / T-5-12: what the mail provider called a sent message and its conversation.
ALTER TABLE "OutboxMessage" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "OutboxMessage" ADD COLUMN "providerThreadId" TEXT;
CREATE INDEX "OutboxMessage_agencyId_providerThreadId_idx" ON "OutboxMessage"("agencyId", "providerThreadId");
