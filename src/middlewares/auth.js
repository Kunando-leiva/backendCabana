import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const auth = async (req, res, next) => {
  try {
      // 1. Verificar token en headers
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ 
              success: false,
              error: 'Formato de token inválido. Use Bearer token' 
          });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
          return res.status(401).json({ 
              success: false,
              error: 'Token no proporcionado' 
          });
      }

      // 2. Verificar y decodificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 3. Validar estructura del token decodificado
      if (!decoded.id || !decoded.rol) {
          return res.status(401).json({ 
              success: false,
              error: 'Token inválido: falta información esencial' 
          });
      }

      

      // 4. Verificar existencia de usuario en BD
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
          return res.status(401).json({ 
              success: false,
              error: 'Usuario no encontrado' 
          });
      }
      

      // 5. Verificar consistencia entre token y BD
      if (user.rol !== decoded.rol) {
          console.warn(`Inconsistencia de roles para usuario ${user._id}: Token=${decoded.rol} DB=${user.rol}`);
          return res.status(401).json({ 
              success: false,
              error: 'Inconsistencia en información de autenticación' 
          });
      }

      // 6. Adjuntar información de usuario a la solicitud
      req.user = {
          id: user._id,
          rol: user.rol, // Usamos el rol de la BD por seguridad
          email: user.email,
          nombre: user.nombre
      };

      next();
  } catch (error) {
      // Manejo específico de errores de JWT
      if (error instanceof jwt.JsonWebTokenError) {
          return res.status(401).json({ 
              success: false,
              error: 'Token inválido o expirado' 
          });
      }
      
      if (error instanceof jwt.TokenExpiredError) {
          return res.status(401).json({ 
              success: false,
              error: 'Token expirado' 
          });
      }

      console.error('Error en middleware auth:', error);
      res.status(500).json({ 
          success: false,
          error: 'Error de autenticación' 
      });
  }
};

export const isAdmin = (req, res, next) => {
  // 1. Verificar que el middleware auth se ejecutó primero
  if (!req.user) {
      return res.status(500).json({ 
          success: false,
          error: 'Error interno: Middleware de autenticación no ejecutado' 
      });
  }

  // 2. Verificar rol de administrador
  if (req.user.rol !== 'admin') {
      console.warn(`Intento de acceso no autorizado. Usuario: ${req.user.id}, Rol: ${req.user.rol}`);
      return res.status(403).json({ 
          success: false,
          error: 'Acceso denegado: Se requieren privilegios de administrador',
          user: {
              id: req.user.id,
              rol: req.user.rol
          }
      });
  }

  // 3. Registrar acceso administrativo (para auditoría)
  console.log(`Acceso administrativo concedido a ${req.user.email} (${req.user.id})`);

  next();
};

// Versión alternativa que permite múltiples roles
export const hasRole = (...roles) => {
  return (req, res, next) => {
      if (!req.user) {
          return res.status(500).json({ 
              success: false,
              error: 'Error interno: Middleware de autenticación no ejecutado' 
          });
      }

      if (!roles.includes(req.user.rol)) {
          return res.status(403).json({ 
              success: false,
              error: `Acceso denegado: Se requiere uno de los siguientes roles: ${roles.join(', ')}`,
              currentRole: req.user.rol
          });
      }

      next();
  };
};