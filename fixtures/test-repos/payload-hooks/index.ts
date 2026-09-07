import { CollectionConfig } from 'payload';
import { logBefore } from './hooks';

export const Users: CollectionConfig = {
  slug: 'users',
  hooks: {
    beforeChange: [logBefore],
  }
};
