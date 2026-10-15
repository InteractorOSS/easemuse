-- G#9: the position a resume was uploaded for, so confirming the draft can add it there and request the match analysis.
ALTER TABLE "Candidate" ADD COLUMN "intakePositionId" UUID;

CREATE INDEX "Candidate_agencyId_intakePositionId_status_idx" ON "Candidate"("agencyId", "intakePositionId", "status");

ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_intakePositionId_fkey" FOREIGN KEY ("intakePositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
