/** @type {import('next').NextConfig} */
const nextConfig = {
    // Desactivar source maps en producción (evita exponer código)
    productionBrowserSourceMaps: false,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'glovox.unabase.com',
            },
        ],
    },
    experimental: {
        serverActions: {
            allowedOrigins: [
                '192.168.100.2:3000',
                'localhost:3000',
                'ec2-44-212-189-160.compute-1.amazonaws.com',
                '44.212.189.160',
                'newstuff.unabase.com'
            ],
        },
    },
};

module.exports = nextConfig;
