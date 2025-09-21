import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import ttf2woff from 'ttf2woff';
import ttf2woff2 from 'ttf2woff2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fontsDir = join(__dirname, '../public/assets/fonts');

// Ensure fonts directory exists
if (!existsSync(fontsDir)) {
  mkdirSync(fontsDir, { recursive: true });
}

// Convert TTF to WOFF and WOFF2
async function convertFont(ttfPath, fontName) {
  try {
    const ttf = readFileSync(ttfPath);
    
    // Convert to WOFF
    const woff = ttf2woff(ttf);
    writeFileSync(join(fontsDir, `${fontName}.woff`), woff);
    
    // Convert to WOFF2
    const woff2 = ttf2woff2(ttf);
    writeFileSync(join(fontsDir, `${fontName}.woff2`), woff2);
    
    console.log(`✅ Converted ${fontName} to WOFF and WOFF2`);
    return true;
  } catch (error) {
    console.error(`❌ Error converting ${fontName}:`, error.message);
    return false;
  }
}

// Process all TTF fonts
async function main() {
  const fontFiles = [
    { ttf: 'upheaval_pro.ttf', name: 'upheaval_pro' },
    { ttf: 'vcr_osd_mono.ttf', name: 'vcr_osd_mono' }
  ];

  let success = true;
  
  for (const { ttf, name } of fontFiles) {
    const ttfPath = join(fontsDir, ttf);
    if (existsSync(ttfPath)) {
      const result = await convertFont(ttfPath, name);
      success = success && result;
    } else {
      console.warn(`⚠️  Font file not found: ${ttfPath}`);
      success = false;
    }
  }

  if (!success) {
    process.exit(1);
  }
}

main().catch(console.error);
