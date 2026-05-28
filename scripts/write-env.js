const fs = require('fs');
const path = require('path');

const environmentPath = path.join(__dirname, '..', 'src', 'environments', 'environment.ts');

const config = {
  supabaseUrl: process.env.NG_APP_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NG_APP_SUPABASE_ANON_KEY || '',
  cloudinaryCloudName: process.env.NG_APP_CLOUDINARY_CLOUD_NAME || '',
  cloudinaryUploadPreset: process.env.NG_APP_CLOUDINARY_UPLOAD_PRESET || ''
};

const file = `export const environment = ${JSON.stringify(config, null, 2)};\n`;

fs.writeFileSync(environmentPath, file);
