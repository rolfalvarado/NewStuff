const { spawn } = require('child_process');
const path = require('path');

const run = () => {
    const rootDir = path.join(__dirname, '..');
    const dbDir = path.join(rootDir, 'dynamodb_local');
    const dbJar = path.join(dbDir, 'DynamoDBLocal.jar');
    const dbLib = path.join(dbDir, 'DynamoDBLocal_lib');

    const args = [
        `-Djava.library.path=${dbLib}`,
        '-jar', dbJar,
        '-sharedDb'
    ];

    console.log('Starting DynamoDB Local...');
    console.log(`Command: java ${args.join(' ')}`);

    const db = spawn('java', args, {
        cwd: dbDir,
        stdio: 'inherit'
    });

    db.on('error', (err) => {
        console.error('Failed to start DynamoDB:', err);
    });
};

run();
