const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { insertErrors, updateErrorStatus } = require('./db');

/**
 * Чтение файла с ошибками
 * @param {string} filePath - путь к файлу
 * @returns {Array<{url: string}>} массив объектов с url
 */
function readErrorsFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const errors = JSON.parse(fileContent);
    
    if (!Array.isArray(errors)) {
      throw new Error('Файл должен содержать массив объектов');
    }
    
    console.log(`Прочитано ${errors.length} записей из файла ошибок`);
    return errors;
  } catch (error) {
    console.error(`Ошибка при чтении файла ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Проверка статуса URL через GET запрос
 * @param {string} url - URL для проверки
 * @returns {Promise<number>} HTTP статус код
 */
async function checkUrlStatus(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000, // 10 секунд таймаут
      validateStatus: () => true, // Не выбрасывать ошибку для любых статусов
      maxRedirects: 5
    });
    return response.status;
  } catch (error) {
    if (error.response) {
      // Сервер ответил с кодом ошибки
      return error.response.status;
    } else if (error.request) {
      // Запрос был сделан, но ответа не получено
      console.error(`Нет ответа от сервера для ${url}`);
      return null;
    } else {
      // Ошибка при настройке запроса
      console.error(`Ошибка при запросе ${url}:`, error.message);
      return null;
    }
  }
}

/**
 * Обработка всех ошибок: заполнение БД и проверка статусов
 * @param {string} errorsFilePath - путь к файлу с ошибками
 * @param {Object} options - опции обработки
 * @param {number} options.concurrency - количество одновременных запросов (по умолчанию 10)
 * @param {boolean} options.skipStatusCheck - пропустить проверку статусов (по умолчанию false)
 */
async function processErrors(errorsFilePath, options = {}) {
  const { concurrency = 10, skipStatusCheck = false } = options;
  
  // Чтение файла
  const errors = readErrorsFile(errorsFilePath);
  
  // Заполнение БД
  insertErrors(errors);
  
  if (skipStatusCheck) {
    console.log('Проверка статусов пропущена');
    return;
  }
  
  // Проверка статусов
  console.log(`Начинаем проверку статусов для ${errors.length} URL...`);
  
  const urls = errors.map(e => e.url);
  let processed = 0;
  let successCount = 0;
  let errorCount = 0;
  
  // Обработка с ограничением параллелизма
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    
    const promises = batch.map(async (url) => {
      try {
        const status = await checkUrlStatus(url);
        if (status !== null) {
          updateErrorStatus(url, status);
          successCount++;
        } else {
          errorCount++;
        }
        processed++;
        
        if (processed % 100 === 0) {
          console.log(`Обработано ${processed}/${urls.length} URL`);
        }
      } catch (error) {
        console.error(`Ошибка при обработке ${url}:`, error.message);
        errorCount++;
        processed++;
      }
    });
    
    await Promise.all(promises);
    
    // Небольшая задержка между батчами, чтобы не перегружать сервер
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`Проверка статусов завершена. Успешно: ${successCount}, Ошибок: ${errorCount}`);
}

module.exports = {
  readErrorsFile,
  checkUrlStatus,
  processErrors
};
