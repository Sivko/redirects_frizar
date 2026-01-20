const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Инициализация подключения к БД
 * @param {string} dbPath - путь к файлу БД
 * @returns {Database} экземпляр БД
 */
function initDatabase(dbPath = 'redirects.db') {
  if (db) {
    return db;
  }
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Включаем WAL режим для лучшей производительности
  
  return db;
}

/**
 * Закрытие подключения к БД
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Создание/пересоздание таблицы actualStatus
 */
function createActualStatusTable() {
  db.exec(`
    DROP TABLE IF EXISTS actualStatus;
    CREATE TABLE actualStatus (
      url TEXT UNIQUE NOT NULL,
      status INTEGER,
      PRIMARY KEY (url)
    );
    CREATE INDEX idx_actualStatus_url ON actualStatus(url);
  `);
  console.log('Таблица actualStatus создана/пересоздана');
}

/**
 * Создание/пересоздание таблицы products
 */
function createProductsTable() {
  db.exec(`
    DROP TABLE IF EXISTS products;
    CREATE TABLE products (
      code TEXT UNIQUE NOT NULL,
      PRIMARY KEY (code)
    );
    CREATE INDEX idx_products_code ON products(code);
  `);
  console.log('Таблица products создана/пересоздана');
}

/**
 * Создание/пересоздание таблицы catalog
 */
function createCatalogTable() {
  db.exec(`
    DROP TABLE IF EXISTS catalog;
    CREATE TABLE catalog (
      code TEXT UNIQUE NOT NULL,
      PRIMARY KEY (code)
    );
    CREATE INDEX idx_catalog_code ON catalog(code);
  `);
  console.log('Таблица catalog создана/пересоздана');
}

/**
 * Создание/пересоздание таблицы redirects
 */
function createRedirectsTable() {
  db.exec(`
    DROP TABLE IF EXISTS redirects;
    CREATE TABLE redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_url TEXT NOT NULL,
      to_url TEXT NOT NULL,
      percent REAL NOT NULL
    );
    CREATE INDEX idx_redirects_from ON redirects(from_url);
  `);
  console.log('Таблица redirects создана/пересоздана');
}

/**
 * Создание всех таблиц
 */
function createAllTables() {
  createActualStatusTable();
  createProductsTable();
  createCatalogTable();
  createRedirectsTable();
}

/**
 * Batch insert для actualStatus
 * @param {Array<{url: string}>} errors - массив объектов с url
 */
function insertErrors(errors) {
  const insert = db.prepare('INSERT OR IGNORE INTO actualStatus (url) VALUES (?)');
  const insertMany = db.transaction((errors) => {
    for (const error of errors) {
      insert.run(error.url);
    }
  });
  
  insertMany(errors);
  console.log(`Вставлено ${errors.length} записей в actualStatus`);
}

/**
 * Обновление статуса для URL
 * @param {string} url - URL
 * @param {number} status - HTTP статус код
 */
function updateErrorStatus(url, status) {
  const update = db.prepare('UPDATE actualStatus SET status = ? WHERE url = ?');
  update.run(status, url);
}

/**
 * Batch insert для products
 * @param {Array<string>} codes - массив кодов
 */
function insertProducts(codes) {
  const insert = db.prepare('INSERT OR IGNORE INTO products (code) VALUES (?)');
  const insertMany = db.transaction((codes) => {
    for (const code of codes) {
      insert.run(code);
    }
  });
  
  insertMany(codes);
  console.log(`Вставлено ${codes.length} записей в products`);
}

/**
 * Batch insert для catalog
 * @param {Array<string>} codes - массив кодов
 */
function insertCatalog(codes) {
  const insert = db.prepare('INSERT OR IGNORE INTO catalog (code) VALUES (?)');
  const insertMany = db.transaction((codes) => {
    for (const code of codes) {
      insert.run(code);
    }
  });
  
  insertMany(codes);
  console.log(`Вставлено ${codes.length} записей в catalog`);
}

/**
 * Получение всех URL из actualStatus
 * @returns {Array<{url: string, status: number|null}>}
 */
function getAllErrors() {
  return db.prepare('SELECT url, status FROM actualStatus').all();
}

/**
 * Получение ошибок с определенным статусом (ошибки сервера)
 * @param {number} minStatus - минимальный статус код (по умолчанию 400)
 * @returns {Array<{url: string, status: number}>}
 */
function getErrorsByStatus(minStatus = 400) {
  return db.prepare('SELECT url, status FROM actualStatus WHERE status >= ? AND status IS NOT NULL').all(minStatus);
}

/**
 * Получение всех кодов из products
 * @returns {Array<{code: string}>}
 */
function getAllProducts() {
  return db.prepare('SELECT code FROM products').all();
}

/**
 * Получение всех кодов из catalog
 * @returns {Array<{code: string}>}
 */
function getAllCatalog() {
  return db.prepare('SELECT code FROM catalog').all();
}

/**
 * Вставка редиректа
 * @param {string} fromUrl - исходный URL
 * @param {string} toUrl - целевой URL
 * @param {number} percent - процент соответствия
 */
function insertRedirect(fromUrl, toUrl, percent) {
  const insert = db.prepare('INSERT INTO redirects (from_url, to_url, percent) VALUES (?, ?, ?)');
  insert.run(fromUrl, toUrl, percent);
}

/**
 * Batch insert для redirects
 * @param {Array<{from: string, to: string, percent: number}>} redirects - массив редиректов
 */
function insertRedirects(redirects) {
  const insert = db.prepare('INSERT INTO redirects (from_url, to_url, percent) VALUES (?, ?, ?)');
  const insertMany = db.transaction((redirects) => {
    for (const redirect of redirects) {
      insert.run(redirect.from, redirect.to, redirect.percent);
    }
  });
  
  insertMany(redirects);
  console.log(`Вставлено ${redirects.length} записей в redirects`);
}

/**
 * Получение редиректов с минимальным процентом соответствия
 * @param {number} minPercent - минимальный процент соответствия
 * @returns {Array<{from_url: string, to_url: string, percent: number}>}
 */
function getRedirectsByPercent(minPercent) {
  return db.prepare('SELECT from_url, to_url, percent FROM redirects WHERE percent >= ? ORDER BY percent DESC').all(minPercent);
}

module.exports = {
  initDatabase,
  closeDatabase,
  createAllTables,
  insertErrors,
  updateErrorStatus,
  insertProducts,
  insertCatalog,
  getAllErrors,
  getErrorsByStatus,
  getAllProducts,
  getAllCatalog,
  insertRedirect,
  insertRedirects,
  getRedirectsByPercent
};
