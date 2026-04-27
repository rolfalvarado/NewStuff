const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const run = () => {
    const rootDir = path.join(__dirname, '..');
    const dbDir = path.join(rootDir, 'dynamodb_local');
    const dbJar = path.join(dbDir, 'DynamoDBLocal.jar');
    const dbLib = path.join(dbDir, 'DynamoDBLocal_lib');

    let javaExe;
    let args = [];

    if (os.platform() === 'win32') {
        const javaDir = path.join(rootDir, 'java_local', 'jdk-21.0.1+12', 'bin');
        const localJavaExe = path.join(javaDir, 'java.exe');
        const javaHomeExe = process.env.JAVA_HOME
            ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
            : null;

        if (fs.existsSync(localJavaExe)) {
            javaExe = localJavaExe;
        } else if (javaHomeExe && fs.existsSync(javaHomeExe)) {
            javaExe = javaHomeExe;
        } else {
            javaExe = 'java';
        }
    } else {
        // On Linux/EC2, use global java
        javaExe = 'java';
    }

    const dataDir = os.platform() === 'win32'
        ? dbDir
        : path.join(os.homedir(), 'dynamodb_data');

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Common arguments
    args = [
        '-Xms256m',
        '-Xmx512m',
        `-Djava.library.path=${dbLib}`,
        '-jar', dbJar,
        '-sharedDb',
        '-dbPath', dataDir,
        '-port', '8000'
    ];

    console.log(`Starting DynamoDB Local on ${os.platform()}...`);
    console.log(`Command: ${javaExe} ${args.join(' ')}`);

    const db = spawn(javaExe, args, {
        cwd: dbDir,
        stdio: 'inherit'
    });

    db.on('error', (err) => {
        console.error('Failed to start DynamoDB:', err);
    });
};

run();
