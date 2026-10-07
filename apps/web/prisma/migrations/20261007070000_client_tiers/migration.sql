-- Plans are now sized by clients: Solo, Studio and Agency.
ALTER TYPE "Plan" RENAME VALUE 'PRO' TO 'SOLO';
ALTER TYPE "Plan" RENAME VALUE 'BUSINESS' TO 'STUDIO';
ALTER TYPE "Plan" ADD VALUE 'AGENCY';
