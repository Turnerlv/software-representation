export class Database {
  async query(sql: string) {
    // Open Connector
    return fetch('http://db.internal', { method: 'POST', body: sql });
  }
}
