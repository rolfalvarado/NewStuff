const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const download = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return download(response.headers.location, dest).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve());
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

const unzip = async (zipPath, destDir) => {
    console.log(`Unzipping ${zipPath} to ${destDir}...`);
    // Wait 2s to ensure file handles are released
    await new Promise(r => setTimeout(r, 2000));

    try {
        // Using tar if possible as it's faster, fallback to powershell
        try {
            execSync(`tar -xf "${zipPath}" -C "${destDir}"`);
        } catch (e) {
            execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
        }
        console.log('Unzip complete.');
    } catch (e) {
        console.error('Unzip failed', e);
        throw e;
    }
};

const setup = async () => {
    // 1. Setup Dirs
    const dbDir = path.join(__dirname, '..', 'dynamodb_local');
    const javaDir = path.join(__dirname, '..', 'java_local');

    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    if (!fs.existsSync(javaDir)) fs.mkdirSync(javaDir, { recursive: true });

    // 2. Download DynamoDB
    const dbJar = path.join(dbDir, 'DynamoDBLocal.jar');
    if (fs.existsSync(dbJar)) {
        console.log('DynamoDB already installed. Skipping.');
    } else {
        console.log('Downloading DynamoDB Local...');
        const dbZip = path.join(dbDir, 'dynamodb.zip');
        try {
            await download('https://d1ni2b6xgwl0sp.cloudfront.net/dynamodb_local_latest.zip', dbZip);
        } catch (e) {
            console.log('Primary URL failed, trying fallback S3 URL...');
            await download('https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.zip', dbZip);
        }
        await unzip(dbZip, dbDir); // Usually fast enough, but technically should await
    }

    // 3. Download Java (OpenJDK 21)
    console.log('Downloading OpenJDK...');
    const javaZip = path.join(javaDir, 'java.zip');
    // Using simple direct link from Adoptium (GitHub release)
    try {
        await download('https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.1%2B12/OpenJDK21U-jdk_x64_windows_hotspot_21.0.1_12.zip', javaZip);
    } catch (e) {
        console.log('Java download failed', e);
        throw e;
    }

    const stats = fs.statSync(javaZip);
    console.log(`Downloaded Java Zip Size: ${stats.size} bytes`);

    if (stats.size < 1000000) {
        throw new Error('Java zip is too small, download probably failed/redirected to error page');
    }

    await unzip(javaZip, javaDir);

    console.log('Setup complete!');
};

setup().catch(err => console.error(err));
