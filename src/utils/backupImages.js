import mongoose from 'mongoose';
import { gridFSBucket } from '../../config';
import fs from 'fs';
import path from 'path';

// Conexión a DB (usa tu mismo connectDB() o configura directa)
const backupDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

const backupImages = async () => {
  const session = await mongoose.startSession();
  try {
    const files = await mongoose.connection.db.collection('images.files').find({}).toArray();
    const chunks = await mongoose.connection.db.collection('images.chunks').find({}).toArray();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `images-backup-${timestamp}.json`);

    fs.writeFileSync(backupFile, JSON.stringify({ files, chunks }, null, 2));
    console.log(`✓ Backup creado en: ${backupFile}`);

  } catch (error) {
    console.error('Error en backup:', error);
  } finally {
    session.endSession();
  }
};

// Ejecutar y programar (usando CRON o similar)
backupImages();