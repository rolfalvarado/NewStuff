const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const archiver = require('archiver');

const sourceDir = path.join(__dirname, '..', 'deploy-package');
const outputPath = path.join(__dirname, '..', 'deploy-package.zip');

console.log('Comprimiendo deploy-package...');

// Eliminar zip anterior si existe
if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
}

// Crear stream de salida
const output = createWriteStream(outputPath);
const archive = archiver('zip', {
    zlib: { level: 6 } // Nivel de compresión balanceado
});

// Eventos
output.on('close', () => {
    const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`✓ Compresión completada: ${sizeMB} MB`);
    console.log(`✓ Archivo creado: deploy-package.zip`);
});

archive.on('error', (err) => {
    throw err;
});

archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
        console.warn('Advertencia:', err);
    } else {
        throw err;
    }
});

// Pipe archive data to the file
archive.pipe(output);

// Agregar todo el contenido de deploy-package
archive.directory(sourceDir, false);

// Finalizar
archive.finalize();
