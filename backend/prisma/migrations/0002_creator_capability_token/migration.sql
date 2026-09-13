-- Decision #38: replace the x-creator-id placeholder header with a real
-- capability-token identity model. A Creator is created by POST
-- /auth/register with no email/password; identity is proven by holding
-- the bearer token returned exactly once at registration. Only its
-- SHA-256 hash is stored.
--
-- `email`/`password_hash` become nullable rather than dropped, so a
-- future passwordless-email upgrade (Decision #38 "Option 2", deferred)
-- can attach an email to an existing Creator without another breaking
-- migration. Assumes no existing `creators` rows predate this migration
-- (nothing has shipped yet) — ADD COLUMN ... NOT NULL below would
-- otherwise fail against populated data.

-- AlterTable
ALTER TABLE "creators" ADD COLUMN     "token_hash" TEXT NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "creators_token_hash_key" ON "creators"("token_hash");
