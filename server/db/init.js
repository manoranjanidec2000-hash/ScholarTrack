import 'dotenv/config';
import { createDatabase } from './database.js';

const db = await createDatabase();
console.log(`ScholarTrack database ready (${db.prepare('SELECT COUNT(*) AS total FROM scholarships').get().total} notices).`);
db.close();