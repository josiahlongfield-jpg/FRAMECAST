-- CreateTable
CREATE TABLE "StoredPart" (
    "key" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "StoredPart_pkey" PRIMARY KEY ("key","partNumber")
);

