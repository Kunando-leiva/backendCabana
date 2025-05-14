import { GridFSBucket } from 'mongodb';
import mongoose from 'mongoose';

// Función para subir imágenes a GridFS y crear registros en MongoDB
const uploadImages = async (files, userId, session) => {
  if (!files || files.length === 0) return [];
  
  return await Promise.all(
    files.map(async (file) => {
      // Verificar duplicados
      const exists = await Image.findOne({ filename: file.originalname }).session(session);
      if (exists) throw new Error(`La imagen ${file.originalname} ya existe`);

      // Subir a GridFS
      const uploadStream = GridFSBucket.openUploadStream(file.originalname, {
        metadata: { uploadedBy: userId, mimeType: file.mimetype }
      });

      const fileId = await new Promise((resolve, reject) => {
        uploadStream.end(file.buffer, () => resolve(uploadStream.id));
        uploadStream.on('error', reject);
      });

      // Crear registro en la colección Image
      const image = await Image.create([{
        filename: file.originalname,
        fileId,
        url: `${API_URL}/api/images/${fileId}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId,
        isPublic: true
      }], { session });

      return image[0]._id;
    })
  );
};

// Función para rollback (eliminar imágenes si hay error)
const deleteImagesFromGridFS = async (imageIds) => {
  if (!imageIds || imageIds.length === 0) return;
  
  await Promise.all([
    Image.deleteMany({ _id: { $in: imageIds } }).catch(console.error),
    ...imageIds.map(id => GridFSBucket.delete(id).catch(console.error))
  ]);
};

export const subirImagenes = async (files, userId, session) => {
  if (!files || files.length === 0) return [];
  
  return await Promise.all(
    files.map(async (file) => {
      const uploadStream = GridFSBucket.openUploadStream(file.originalname, {
        metadata: {
          uploadedBy: userId,
          mimeType: file.mimetype
        }
      });

      const fileId = await new Promise((resolve, reject) => {
        uploadStream.end(file.buffer, () => resolve(uploadStream.id));
        uploadStream.on('error', reject);
      });

      const image = new Image({
        filename: file.originalname,
        fileId,
        url: `${API_URL}/api/images/${fileId}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId
      });

      await image.save({ session });
      return image;
    })
  );
};