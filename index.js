const path = require('path');
const { 
  initDatabase, 
  closeDatabase, 
  createAllTables,
  getErrorsByStatus,
  getAllProducts,
  getAllCatalog,
  insertRedirects
} = require('./db');
const { processErrors } = require('./processErrors');
const { loadAllReferences } = require('./loadReferences');
const { findBestMatch } = require('./fuzzyMatch');

/**
 * Извлечение последнего сегмента из URL
 * @param {string} url - URL
 * @returns {string|null} последний сегмент или null
 */
function extractLastSegment(url) {
  try {
    // Декодируем URL
    const decodedUrl = decodeURIComponent(url);
    // Убираем trailing slash если есть
    const cleanUrl = decodedUrl.replace(/\/$/, '');
    // Извлекаем последний сегмент
    const segments = cleanUrl.split('/');
    const lastSegment = segments[segments.length - 1];
    
    return lastSegment || null;
  } catch (error) {
    console.error(`Ошибка при извлечении сегмента из ${url}:`, error.message);
    return null;
  }
}

/**
 * Определение типа URL (product или catalog)
 * @param {string} url - URL
 * @returns {string|null} 'product', 'catalog' или null
 */
function getUrlType(url) {
  if (url.includes('/product/')) {
    return 'product';
  } else if (url.includes('/catalog/')) {
    return 'catalog';
  }
  return null;
}

/**
 * Обработка редиректов
 * Создает редиректы только для страниц с ошибкой (статус >= 400)
 */
function processRedirects() {
  console.log('\n=== Начинаем обработку редиректов ===');
  
  // Получаем только ошибки со статусом >= 400 (ошибки сервера)
  const errors = getErrorsByStatus(400);
  const products = getAllProducts();
  const catalog = getAllCatalog();
  
  console.log(`Всего ошибок со статусом >= 400: ${errors.length}`);
  console.log(`Всего products: ${products.length}`);
  console.log(`Всего catalog: ${catalog.length}`);
  
  const redirects = [];
  let processed = 0;
  let productMatches = 0;
  let catalogMatches = 0;
  let skipped = 0;
  
  for (const error of errors) {
    const url = error.url;
    const urlType = getUrlType(url);
    
    if (!urlType) {
      skipped++;
      continue;
    }
    
    const code = extractLastSegment(url);
    if (!code) {
      skipped++;
      continue;
    }
    
    // Выбираем соответствующую таблицу для поиска
    const searchTable = urlType === 'product' ? products : catalog;
    
    // Выполняем неточный поиск
    const match = findBestMatch(code, searchTable);
    
    if (match) {
      const toUrl = `https://frizar.ru/${urlType}/${match.code}`;
      
      redirects.push({
        from: url,
        to: toUrl,
        percent: match.percent
      });
      
      if (urlType === 'product') {
        productMatches++;
      } else {
        catalogMatches++;
      }
    } else {
      skipped++;
    }
    
    processed++;
    
    if (processed % 1000 === 0) {
      console.log(`Обработано ${processed}/${errors.length} ошибок, найдено редиректов: ${redirects.length}`);
    }
  }
  
  // Вставляем все редиректы в БД
  if (redirects.length > 0) {
    insertRedirects(redirects);
  }
  
  console.log(`\nОбработка редиректов завершена:`);
  console.log(`- Обработано: ${processed}`);
  console.log(`- Найдено редиректов: ${redirects.length}`);
  console.log(`  - Products: ${productMatches}`);
  console.log(`  - Catalog: ${catalogMatches}`);
  console.log(`- Пропущено: ${skipped}`);
}

/**
 * Основная функция
 */
async function main() {
  const dataDir = path.join(__dirname, 'data');
  const errorsFile = path.join(dataDir, 'nest.pages_error.json');
  const productsFile = path.join(dataDir, 'nest.product1cs.json');
  const catalogFile = path.join(dataDir, 'nest.catalog1cs.json');
  
  try {
    console.log('=== Инициализация БД ===');
    initDatabase();
    createAllTables();
    
    console.log('\n=== Обработка ошибок ===');
    // Проверяем статусы всех URL через GET запросы
    await processErrors(errorsFile, { 
      skipStatusCheck: false, // Проверяем статусы всех URL
      concurrency: 10 
    });
    
    console.log('\n=== Загрузка справочников ===');
    loadAllReferences(productsFile, catalogFile);
    
    console.log('\n=== Обработка редиректов ===');
    processRedirects();
    
    console.log('\n=== Готово! ===');
    
  } catch (error) {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Запуск
if (require.main === module) {
  main();
}

module.exports = { main };
