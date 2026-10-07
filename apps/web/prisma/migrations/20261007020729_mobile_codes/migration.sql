-- CreateTable
CREATE TABLE "MobileCode" (
    "codeHash" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MobileCode_pkey" PRIMARY KEY ("codeHash")
);
