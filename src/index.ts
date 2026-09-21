import Express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';
import { fabRouter, migrateFab } from './routes/fabricacion';

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
    await migrateFab();
    app.listen(PORT, () => {
        console.log(`\nFabricación disponible en http://localhost:${PORT}`);
    });
}
main();
