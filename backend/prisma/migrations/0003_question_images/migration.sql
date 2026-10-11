-- Decision #75: one uploaded image per question. Bytes live in Postgres
-- (no separate object store to provision); a question points at its image,
-- and deleting the image only clears that pointer.

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "image_id" TEXT;

-- CreateTable
CREATE TABLE "question_images" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_images_creator_id_idx" ON "question_images"("creator_id");

-- CreateIndex
CREATE INDEX "questions_image_id_idx" ON "questions"("image_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "question_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_images" ADD CONSTRAINT "question_images_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

