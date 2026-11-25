import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { gzipMiddleware } from './server/gzipMiddleware.js';

dotenv.config({ path: ['.env.local', '.env'] });

const app = express();

// Compress JSON API responses & JS/CSS bundles over the wire (75-92% bandwidth reduction)
app.use(gzipMiddleware);

// Parse CLI arguments if passed (e.g. npm run dev -- --port 3000 --host 0.0.0.0)
const portIndex = process.argv.indexOf('--port');
const cliPort = portIndex !== -1 ? parseInt(process.argv[portIndex + 1], 10) : NaN;
const PORT = !isNaN(cliPort) && cliPort > 0
  ? cliPort
  : (parseInt(process.env.APP_PORT || '', 10) || parseInt(process.env.DEFAULT_APP_PORT || '', 10) || 3000);

const hostIndex = process.argv.indexOf('--host');
const cliHost = hostIndex !== -1 ? process.argv[hostIndex + 1] : '';
const HOST = cliHost || '0.0.0.0';

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Fast Health check for Cloud Run and ingress probes
app.get(['/api/health', '/health', '/healthz'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lazy-loaded API router so port 3000 binds in < 100ms on cold start
let apiHandler: express.RequestHandler = (req, res, next) => next();
let apiInitPromise: Promise<void> | null = null;

function ensureApiInitialized(): Promise<void> {
  if (!apiInitPromise) {
    apiInitPromise = import('./server/routes.js')
      .then((mod) => {
        apiHandler = mod.default;
      })
      .catch((err) => {
        console.error('Error cargando rutas API:', err);
      });
  }
  return apiInitPromise;
}

// Mount API routes
app.use('/api', (req, res, next) => {
  ensureApiInitialized().then(() => {
    apiHandler(req, res, next);
  }).catch(next);
});

// Frontend middleware
let frontendHandler: express.RequestHandler = (req, res, next) => next();

async function initFrontend() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
          watch: null,
        },
        appType: 'spa',
      });
      frontendHandler = vite.middlewares;
      console.log('Vite middleware configurado en modo SPA.');
    } catch (err) {
      console.error('Error al inicializar Vite middleware:', err);
      frontendHandler = (_req, res) => {
        res.status(500).send('Error inicializando el servidor de desarrollo Vite.');
      };
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const staticMiddleware = express.static(distPath, {
      maxAge: '7d',
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
    frontendHandler = (req, res, next) => {
      staticMiddleware(req, res, () => {
        const indexPath = path.join(distPath, 'index.html');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexPath, (err) => {
          if (err) {
            res.status(200).send('<!DOCTYPE html><html><head><title>La Hormiga</title></head><body><div id="root">Cargando aplicación...</div></body></html>');
          }
        });
      });
    };
  }
}

let frontendInitPromise: Promise<void> | null = null;
function ensureFrontendInitialized(): Promise<void> {
  if (!frontendInitPromise) {
    frontendInitPromise = initFrontend();
  }
  return frontendInitPromise;
}

app.use((req, res, next) => {
  ensureFrontendInitialized().then(() => {
    frontendHandler(req, res, next);
  }).catch(next);
});

// Start HTTP server immediately so port 3000 is reachable without delay
const server = app.listen(PORT, HOST, () => {
  console.log(`Servidor iniciado y escuchando en http://${HOST}:${PORT}`);

  // Initialize Vite middleware first so pre-warm GET / isn't blocked by heavy API imports
  ensureFrontendInitialized()
    .catch(() => {})
    .finally(() => {
      setTimeout(() => {
        ensureApiInitialized();
        import('./server/db.js')
          .then(({ initDatabaseSchema }) => initDatabaseSchema())
          .catch(() => {
            console.log('Supabase esquema en espera de conexión.');
          });
      }, 400);
    });
});

// Prevent premature keep-alive socket closure races with reverse proxies / pre-warm probes
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.on('error', (err: any) => {
  console.error('Error en el servidor HTTP:', err);
  if (err?.code === 'EADDRINUSE') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server] Unhandled Rejection controlada:', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error('[Server] Puerto en uso, cerrando:', err);
    process.exit(1);
  }
  console.error('[Server] Uncaught Exception controlada:', err?.message || err);
});

const shutdown = (signal: string) => {
  console.log(`Recibida señal ${signal}, cerrando servidor...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
