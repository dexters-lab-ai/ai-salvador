// Simple script to copy font files to the correct location
// This is a fallback when font conversion isn't available

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the current directory in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define source and destination directories
const srcDir = join(__dirname, '..', 'public', 'assets', 'fonts');
const destDir = join(__dirname, '..', 'dist', 'assets', 'fonts');

// Ensure destination directory exists
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

// List of font files to copy
const fontFiles = [
  'upheaval_pro.ttf',
  'vcr_osd_mono.ttf'
];

// Copy each font file
let filesCopied = 0;
fontFiles.forEach(font => {
  const srcPath = join(srcDir, font);
  const destPath = join(destDir, font);
  
  if (existsSync(srcPath)) {
    try {
      copyFileSync(srcPath, destPath);
      console.log(`Copied: ${font}`);
      filesCopied++;
    } catch (error) {
      console.error(`Error copying ${font}:`, error.message);
    }
  } else {
    console.warn(`Font file not found: ${font}`);
  }
});

console.log(`Font copy complete! Copied ${filesCopied} of ${fontFiles.length} files.`);
