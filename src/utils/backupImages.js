import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';

const backup = () => {
  const date = new Date().toISOString().split('T')[0];
  const backupDir = join(__dirname, `../backups/uploads-${date}`);
  
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  exec(`cp -r ../uploads/* ${backupDir}`, (error) => {
    if (error) console.error('Backup failed:', error);
    else console.log(`Backup creado en: ${backupDir}`);
  });
};

export default backup;