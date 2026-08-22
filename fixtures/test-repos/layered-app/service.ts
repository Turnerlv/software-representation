import { Database } from './db.js';

export class UserService {
  private db: Database;
  constructor() {
    this.db = new Database();
  }
  async getUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}
