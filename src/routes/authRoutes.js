import express from 'express';
import { register, login } from '../controllers/authController.js';

const router = express.Router();

// Validación de campos
const validateAuth = (req, res, next) => {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }
  next();
};

router.post('/register', register);
router.post('/login', validateAuth, login);

export default router;