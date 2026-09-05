import { initTransaction, commitTransaction, killTransaction } from 'payload';
export async function safeCreate(req) {
  const shouldCommit = await initTransaction(req);
  try {
    if (shouldCommit) await commitTransaction(req);
  } catch (err) {
    await killTransaction(req);
  }
}
