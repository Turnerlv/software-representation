import { TaskConfig } from 'payload';
export const myTask: TaskConfig = {
  slug: 'myTask',
  handler: async ({ input }) => { console.log(input); return { output: {} }; }
};
