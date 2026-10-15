import Express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';
import { fabRouter, migrateFab, verificarErp } from './routes/fabricacion';

const app  = Express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(Express.json());

app.use('/fab', fabRouter);

// Servir el frontend compilado
app.use(Express.static(path.join(__dirname, '..', 'frontend', 'dist')));
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

async function main() {
    const faltan = ['FAB_HOST', 'FAB_USER', 'FAB_PASS', 'FAB_LOCO_DB'].filter(k => !process.env[k]);
    if (faltan.length) throw new Error(`Faltan variables en .env: ${faltan.join(', ')} (ver .env.example)`);
    await migrateFab();
    await verificarErp();
    app.listen(PORT, () => {
        console.log(`\nFabricación disponible en http://localhost:${PORT}`);
    });
}
main().catch(e => {
    console.error(`\nNo se pudo iniciar Fabricación: ${e.message}`);
    process.exit(1);
});
