import { buildConfig } from 'payload';
import { seoPlugin } from '@payloadcms/plugin-seo';
export default buildConfig({
  plugins: [ seoPlugin({ generateTitle: () => 'Title' }) ]
});
