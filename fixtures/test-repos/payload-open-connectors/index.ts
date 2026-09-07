export const myHandler = async (req) => {
  const { payload } = req;
  await payload.find({ collection: 'posts' });
  await Model.create({ title: 'test' });
};
