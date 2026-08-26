import 'server-only';

export function getSecretConfig() {
  return process.env.SECRET_KEY;
}
