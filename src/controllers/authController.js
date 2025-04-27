import User from '../models/User.js';
import jwt from 'jsonwebtoken';

// Registro de usuario
export const register = async (req, res) => {
    try {
        const { nombre, email, password, rol } = req.body;
        const user = new User({ nombre, email, password, rol });
        await user.save();
        
        // Generar token JWT
        const token = jwt.sign(
            { id: user._id, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({ token, user: { id: user._id, nombre, email, rol } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Login
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) throw new Error('Credenciales inválidas');

        const isMatch = await user.matchPassword(password);
        if (!isMatch) throw new Error('Credenciales inválidas');

        const token = jwt.sign(
            { id: user._id, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        

        res.json({ token, user: { id: user._id, nombre: user.nombre, email, rol: user.rol } });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};