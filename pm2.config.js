module.exports = {
    apps: [
        {
            name: "dynamo-db",
            script: "scripts/start-db.js",
            cwd: __dirname,
            env: {
                NODE_ENV: "production"
            },
            max_memory_restart: "512M",
            exp_backoff_restart_delay: 100
        },
        {
            name: "next-app",
            script: "npm",
            args: "start",
            cwd: __dirname,
            env: {
                NODE_ENV: "production",
                PORT: 3000,
                SERVER_ENCRYPTION_KEY: "1U91FpNfsxNHDC6eVKFfmAE0S779H/QEfHhviXA2K8s=",
                DYNAMODB_ENDPOINT: "http://127.0.0.1:8000",
                AWS_REGION: "us-east-1",
                AWS_ACCESS_KEY_ID: "local",
                AWS_SECRET_ACCESS_KEY: "local",
                GOOGLE_DRIVE_CLIENT_EMAIL: "google-drive-uploader@stuff-489017.iam.gserviceaccount.com",
                GOOGLE_DRIVE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhJ4mFg5fXpBj2\\nZif9HubblLjc5b+nAWH7+5lJTgua06iikfXgEzriqqxyhKbrLtDWpPEz1Er8KViF\\nxjJS3aZmWHUsZ532VjDP5aYz1AmvQMNceF6zY6c/qqxlKteSoZZC/Q2MM8J4hfDW\\nCKnIYJCFi3tic9nqlfAZBEX8lLNc/wm1uRUbEdLyvFz4zuiYvwhgqcwTfuKYZaXr\\nwNnneAHrgApVfkLBF+yBS5p7E0itlbnbTLU3T7zxOpsFQdgXuWZn6sc5J/s9I9ZS\\nbBmWpdd53WR82vNna6uqvBb3JF1uIcdTcKeomGdDqVDwdxFIApd780tNsj0BMo4e\\nykA12i0VAgMBAAECggEACTCm8VcstHWTO0NyMGe5fo70eLe7+eIZkMJ1QEO6P4iS\\nIoiYo5vFVIko3sfBVGolxg0Xd0kcAmzhmxw645z+dMD5j2VvUiW0elfiT81A0/Ft\\nx/F11BamNfgOb1avU+Hak0Nm8SkPsAGvkdzqqS4f2AOYdq1J4MRb93lwLd4X8By5\\nNmS3tZ7Sahet0fSXiayGbcPHjPeWe4rk26+JAFAZtiEjdrP3YI0sHs/UcfKJ74Ja\\nqUIEXh/zj4nZSpmvugFgvFewpWLglTrX3eBAqN+DnKk+D7ZrgmL/WQPGwLgKXqmC\\n9gpJEJ/pG8eC3LTY7qMB6HNcFk05ES2b5N+86hPj5QKBgQD8HI0+22fRMz1F13sK\\nyIR+df1+Eq35kyF3PX2BtFfLYTsae5YqIMH0z3QEJm4GjciiF4wWB79zzBROWAct\\n2CCMiAIPvwPsgK8qUtR8hXhazGRVtAmu9+c8w4yRvi1vt48cM/fXOb2DoC5xL3P4\\nLAXvZtyLBZzPfzL1WsEc5CXHZwKBgQDkoIwBqiDdMs6gTfsCQABXvd12/MiKjSAp\\nExgeH7BWGXPGC4jFOKOcx8Mtp7cqYsOaJX5uv18gI2NG/MI98cg/cKnwH/DDysUl\\nqUIycbkp+aoty7z1Hjf+W4vMYGnC3hvYDLDih3PYR6S6yuWoIsmYiPUDTfzMHh4e\\nUWvTbTCGIwKBgQCo9jGrWLwhNmfwMNPjjDNP1Z/IKJi0VOju0yUUEltskINd4knn\\nfgC/I3Grfl3qwoceKw3Vjee/oZxSTSiyjtBxno1TJD9q92ttwAlsUr8wix8LWRfM\\nTZSJ4ryIyJ4G60xcKHAHrEjYuDen35enUUnBAnz4JxDK94KdcO9Pf4/aLQKBgDZ5\\nJkKzRXdOxrqdOeRUWYCOZXkXS7TvYS1INmPfCwXItLQIRYMwNpOBaTi0kEjSFWbh\\n7hj3EfQ3Wk0sph9aP2sWLfdftN8Bri2GAZbBT+v3Z5vXwmLo21CIgWulwS1D/IBi\\nrbabrXdnwpEbDNMdzsjAQRiTeVstBeIVZkqO5pPfAoGABMmwgKtXHnOdTKWpujIe\\nP5X8wzdub1KuYEul3FcvXN48CoqRVc5SvT1bxXj/EGTVWUr5jwPhEsXdgcRZr1dM\\nVW7oaPnn9/SAULKIxBTAMw51iS0f1kEjwaO6IGgy8sdmr6pkfRxKpxvBQ1wPXI1v\\ndQ4wxSAUUUAQ1h3o4+Kb6tk=\\n-----END PRIVATE KEY-----\\n",
                GOOGLE_DRIVE_ROOT_FOLDER_ID: "0AIe1mMSXYwmhUk9PVA"
            },
            max_memory_restart: "1G",
            exp_backoff_restart_delay: 100
        },
        {
            name: "monitor-service",
            script: "scripts/monitor-service.js",
            cwd: __dirname,
            env: {
                NODE_ENV: "production",
                SERVER_ENCRYPTION_KEY: "1U91FpNfsxNHDC6eVKFfmAE0S779H/QEfHhviXA2K8s=",
                DYNAMODB_ENDPOINT: "http://127.0.0.1:8000",
                AWS_REGION: "us-east-1",
                AWS_ACCESS_KEY_ID: "local",
                AWS_SECRET_ACCESS_KEY: "local",
                // Temporal workaround for SSL Certificate local issuer error
                NODE_TLS_REJECT_UNAUTHORIZED: "0"
            },
            max_memory_restart: "256M",
            exp_backoff_restart_delay: 100
        }
    ]
};
