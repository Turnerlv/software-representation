'use server';

export async function deleteProduct(formData: FormData) {
  const id = Number(formData.get('id'));
  return { deleted: id };
}
