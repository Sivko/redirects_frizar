const { execSync } = require('child_process');
const path = require('path');

/**
 * Получение коллекций с сервера
 * Выполняет bash скрипт для экспорта данных из MongoDB
 */
async function fetchCollections() {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'fetch_mongo_data.sh');
  
  console.log('\nСкачивание коллекций с сервера...');
  console.log('-'.repeat(50));
  
  try {
    execSync(`bash ${scriptPath}`, { stdio: 'inherit' });
    console.log('-'.repeat(50));
    console.log('✓ Скачивание коллекций завершено успешно');
  } catch (error) {
    console.log('-'.repeat(50));
    console.error('✗ Ошибка при скачивании коллекций');
    console.error(error.message);
    throw error;
  }
}

module.exports = { fetchCollections };
