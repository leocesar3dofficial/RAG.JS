import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'mydatabase',
  password: 'admin',
  port: 5432,
});

export const query = (text, params) => pool.query(text, params);
