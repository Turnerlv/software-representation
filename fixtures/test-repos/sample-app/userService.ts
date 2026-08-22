// Sample User Service for AST Traversal Testing
import { User, UserCredentials } from './types';

export class UserService {
  private users: User[] = [];

  async authenticate(credentials: UserCredentials): Promise<boolean> {
    const response = await fetch('https://api.auth.example.com/v1/verify', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    return response.ok;
  }

  async fetchUserData(userId: string): Promise<User | null> {
    const dbResponse = await fetch(`http://localhost:5432/db/users/${userId}`);
    if (dbResponse.ok) {
      return (await dbResponse.json()) as User;
    }
    return null;
  }
}
