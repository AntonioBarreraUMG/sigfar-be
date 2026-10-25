import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { makeAuthRouter } from './routes/auth.routes.js';
import { makeSucursalesRouter } from './routes/sucursales.routes.js';
import { makeMedicamentosRouter } from './routes/medicamentos.routes.js';
import { makeInventariosRouter } from './routes/inventarios.routes.js';
import { makeTransferenciasRouter } from './routes/transferencias.routes.js';
import { authMiddleware } from './middleware/auth.js';
import { errorMiddleware, HttpError } from './utils/errors.js';

export function makeApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new HttpError(403, 'ORIGEN_NO_PERMITIDO', 'Origen no permitido por CORS.'));
  } }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/v1/health', (req, res) => res.json({ servicio: 'SIGFAR', estado: 'activo' }));
  const authenticate = authMiddleware(config.jwtSecret);
  app.use('/api/v1/auth', makeAuthRouter({ jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn, authenticate }));
  app.use('/api/v1/sucursales', makeSucursalesRouter(authenticate));
  app.use('/api/v1/medicamentos', makeMedicamentosRouter(authenticate));
  app.use('/api/v1/inventarios', makeInventariosRouter(authenticate));
  app.use('/api/v1/transferencias', makeTransferenciasRouter(authenticate));
  app.use((req, res, next) => next(new HttpError(404, 'RUTA_NO_ENCONTRADA', 'Ruta API no encontrada.')));
  app.use(errorMiddleware);
  return app;
}
