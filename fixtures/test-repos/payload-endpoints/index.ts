export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  endpoints: [
    { path: '/custom', method: 'post', handler: async (req) => Response.json({ ok: true }) }
  ],
  fields: []
}
