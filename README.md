# softwarerepresentation.com

The canonical home of the Software Representation discipline.

Built with Astro + Tailwind CSS. Deployed on Cloudflare Pages.

## Development

```bash
npm install
npm run dev
```

## Deploy

Connect this repo to Cloudflare Pages. Build command: `npm run build`. Output directory: `dist`.

## Email Capture

The site uses Buttondown for email capture. To avoid hardcoding your username in this public repository, configure it via an environment variable.

1. **Local Development:** Copy `.env.example` to `.env` and set `PUBLIC_BUTTONDOWN_USERNAME`.
2. **Production:** Add `PUBLIC_BUTTONDOWN_USERNAME` to your Cloudflare Pages environment variables.
**Note**: Cloudflare Pages build environment variables are not available in the browser. See **Build Time Variables** in the Cloudflare Pages documentation for more information.
