import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Asegurar la carga de variables del archivo .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.MYSQL_PORT) || 3306;
const user = process.env.MYSQL_USER || 'root';
const password = process.env.MYSQL_PASSWORD || '';
const database = process.env.MYSQL_DATABASE || 'ship24go';

export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
});

console.log(`[MySQL] Pool de conexiones creado con éxito para la base de datos "${database}" en ${host}:${port}`);
