export interface User {
  id: string;
  email: string;
  name: string;
}

export type UserCredentials = {
  email: string;
  passwordHash: string;
};
