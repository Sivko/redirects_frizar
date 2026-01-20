const fs = require('fs');
const path = require('path');
const { insertProducts, insertCatalog } = require('./db');

/**
 * Чтение JSON файла и извлечение кодов
 * @param {string} filePath - путь к файлу
 * @returns {Array<string>} массив кодов
 */
function readCodesFromFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    if (!Array.isArray(data)) {
      throw new Error('Файл должен содержать массив объектов');
    }
    
    const codes = [];
    for (const item of data) {
      if (item.code && typeof item.code === 'string') {
        codes.push(item.code);
      }
    }
    
    console.log(`Извлечено ${codes.length} кодов из ${data.length} записей в файле ${path.basename(filePath)}`);
    return codes;
  } catch (error) {
    console.error(`Ошибка при чтении файла ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Загрузка products из файла
 * @param {string} filePath - путь к файлу с products
 */
function loadProducts(filePath) {
  console.log(`Загрузка products из ${filePath}...`);
  const codes = readCodesFromFile(filePath);
  insertProducts(codes);
  console.log(`Products загружены: ${codes.length} записей`);
}

/**
 * Загрузка catalog из файла
 * @param {string} filePath - путь к файлу с catalog
 */
function loadCatalog(filePath) {
  console.log(`Загрузка catalog из ${filePath}...`);
  const codes = readCodesFromFile(filePath);
  insertCatalog(codes);
  console.log(`Catalog загружен: ${codes.length} записей`);
}

/**
 * Загрузка всех справочников
 * @param {string} productsFilePath - путь к файлу с products
 * @param {string} catalogFilePath - путь к файлу с catalog
 */
function loadAllReferences(productsFilePath, catalogFilePath) {
  loadProducts(productsFilePath);
  loadCatalog(catalogFilePath);
}

module.exports = {
  readCodesFromFile,
  loadProducts,
  loadCatalog,
  loadAllReferences
};
