import { UserService } from './service.js';
import express from 'express';

const app = express();
const userService = new UserService();

app.get('/users/:id', async (req, res) => {
  const user = await userService.getUser(req.params.id);
  res.json(user);
});
