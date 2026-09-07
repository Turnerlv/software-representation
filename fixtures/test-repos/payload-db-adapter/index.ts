import { PayloadRequest } from 'payload';
export async function customOperation(req: PayloadRequest) {
  const doc = await req.payload.db.findOne({
    collection: 'users',
    req,
    where: { email: { equals: 'test@test.com' } }
  });
  return doc;
}
