/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
    serverComponentsExternalPackages: ['pdfkit'],
  },
  outputFileTracingIncludes: {
    '/api/drive/backup-prontuario': ['./node_modules/pdfkit/js/data/**/*'],
  },
};

module.exports = nextConfig;
