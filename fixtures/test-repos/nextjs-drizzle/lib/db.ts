import { eq } from 'drizzle-orm';
import { db } from './setup';
import { users } from './schema';
import { revalidatePath } from 'next/cache';

export async function getUser(id: number) {
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0];
}

export async function deleteUser(id: number) {
  await db.delete(users).where(eq(users.id, id));
  revalidatePath('/dashboard');
}
