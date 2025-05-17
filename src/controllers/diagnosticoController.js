import mongoose from 'mongoose';
import { gridFSBucket } from '../../config/gridfs-config.js';
import Cabana from '../models/Cabana.js';
import Image from '../models/Image.js';

export const verificarImagenes = async (req, res) => {
    try {
        // -------------------------------------
        // 1. Verificar archivos en GridFS
        // -------------------------------------
        const filesInGridFS = await gridFSBucket.find().toArray();
        const gridfsReport = filesInGridFS.map(file => ({
            fileId: file._id,
            filename: file.filename,
            uploadDate: file.uploadDate,
            length: file.length // Tamaño en bytes
        }));

        // -------------------------------------
        // 2. Verificar documentos en la colección 'images'
        // -------------------------------------
        const imagesInDB = await Image.find({});
        const imagesReport = imagesInDB.map(img => ({
            _id: img._id,
            fileId: img.fileId,
            filename: img.filename,
            relatedCabana: img.relatedCabana || "Sin asignar"
        }));

        // -------------------------------------
        // 3. Verificar cabañas y sus imágenes asociadas
        // -------------------------------------
        const cabanas = await Cabana.find().populate({
            path: 'images',
            select: 'filename fileId'
        });
        const cabanasReport = cabanas.map(cabana => ({
            _id: cabana._id,
            nombre: cabana.nombre,
            totalImages: cabana.images.length,
            images: cabana.images.map(img => ({
                _id: img._id,
                filename: img.filename,
                fileId: img.fileId
            }))
        }));

        // -------------------------------------
        // Respuesta estructurada
        // -------------------------------------
        res.json({
            success: true,
            gridfs: {
                count: filesInGridFS.length,
                files: gridfsReport
            },
            imagesCollection: {
                count: imagesInDB.length,
                documents: imagesReport
            },
            cabanas: {
                count: cabanas.length,
                data: cabanasReport
            }
        });

    } catch (error) {
        console.error("Error en diagnóstico:", error);
        res.status(500).json({
            success: false,
            error: "Error al verificar imágenes",
            details: API_URL === 'development' ? error.message : undefined
        });
    }
};

