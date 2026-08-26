// Next.js middleware — re-exports auth function as the middleware entry point
// File path: middleware.ts

export { auth as middleware } from './lib/auth';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
