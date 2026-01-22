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
 * Проверка статуса URL через GET запрос с отслеживанием редиректов
 * @param {string} url - URL для проверки
 * @returns {Promise<{status: number|null, finalUrl: string|null}>} объект с HTTP статус кодом и финальным URL
 */
async function checkUrlStatus(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000, // 10 секунд таймаут
      validateStatus: () => true, // Не выбрасывать ошибку для любых статусов
      maxRedirects: 10 // Отслеживаем редиректы
    });
    
    // Получаем финальный URL после всех редиректов
    // Пробуем разные способы получения финального URL
    let finalUrl = null;
    if (response.request?.res?.responseUrl) {
      finalUrl = response.request.res.responseUrl;
    } else if (response.request?.res?.responseURL) {
      finalUrl = response.request.res.responseURL;
    } else if (response.request?.responseURL) {
      finalUrl = response.request.responseURL;
    } else if (response.config?.url) {
      finalUrl = response.config.url;
    }
    
    // Нормализуем URL для сравнения (убираем trailing slash)
    const normalizeUrl = (u) => u ? u.replace(/\/$/, '') : u;
    const normalizedOriginal = normalizeUrl(url);
    const normalizedFinal = normalizeUrl(finalUrl);
    
    // Если финальный URL отличается от исходного, значит был редирект
    const wasRedirected = finalUrl && normalizedFinal !== normalizedOriginal;
    
    return {
      status: response.status,
      finalUrl: wasRedirected ? finalUrl : null
    };
  } catch (error) {
    if (error.response) {
      // Сервер ответил с кодом ошибки
      let finalUrl = null;
      if (error.response.request?.res?.responseUrl) {
        finalUrl = error.response.request.res.responseUrl;
      } else if (error.response.request?.res?.responseURL) {
        finalUrl = error.response.request.res.responseURL;
      } else if (error.response.request?.responseURL) {
        finalUrl = error.response.request.responseURL;
      } else if (error.config?.url) {
        finalUrl = error.config.url;
      }
      
      // Нормализуем URL для сравнения
      const normalizeUrl = (u) => u ? u.replace(/\/$/, '') : u;
      const normalizedOriginal = normalizeUrl(url);
      const normalizedFinal = normalizeUrl(finalUrl);
      const wasRedirected = finalUrl && normalizedFinal !== normalizedOriginal;
      
      return {
        status: error.response.status,
        finalUrl: wasRedirected ? finalUrl : null
      };
    } else if (error.request) {
      // Запрос был сделан, но ответа не получено
      console.error(`Нет ответа от сервера для ${url}`);
      return { status: null, finalUrl: null };
    } else {
      // Ошибка при настройке запроса
      console.error(`Ошибка при запросе ${url}:`, error.message);
      return { status: null, finalUrl: null };
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
  
  console.log(`\n[processErrors] Начало обработки. skipStatusCheck = ${skipStatusCheck}`);
  
  // Чтение файла
  const errors = readErrorsFile(errorsFilePath);
  
  // Заполнение БД
  insertErrors(errors);
  
  if (skipStatusCheck) {
    console.log('⚠️  Проверка статусов пропущена (skipStatusCheck = true)');
    return;
  }
  
  // Проверка статусов
  console.log(`\n[processErrors] Начинаем проверку статусов для ${errors.length} URL...`);
  console.log(`[processErrors] Параллелизм: ${concurrency} запросов`);
  
  const urls = errors.map(e => e.url);
  let processed = 0;
  let successCount = 0;
  let errorCount = 0;
  
  // Обработка с ограничением параллелизма
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    
    console.log(`[processErrors] Обрабатываем батч ${Math.floor(i / concurrency) + 1}: ${batch.length} URL`);
    
    const promises = batch.map(async (url) => {
      try {
        const result = await checkUrlStatus(url);
        if (result.status !== null) {
          updateErrorStatus(url, result.status, result.finalUrl);
          successCount++;
          if (result.finalUrl) {
            console.log(`[processErrors] ✓ ${url} -> редирект на ${result.finalUrl} -> статус ${result.status}`);
          } else {
            console.log(`[processErrors] ✓ ${url} -> статус ${result.status}`);
          }
        } else {
          errorCount++;
          console.log(`[processErrors] ✗ ${url} -> не удалось получить статус`);
        }
        processed++;
        
        if (processed % 100 === 0) {
          console.log(`[processErrors] Обработано ${processed}/${urls.length} URL`);
        }
      } catch (error) {
        console.error(`[processErrors] Ошибка при обработке ${url}:`, error.message);
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
  
  console.log(`\n[processErrors] ✓ Проверка статусов завершена:`);
  console.log(`[processErrors]   - Успешно проверено: ${successCount}`);
  console.log(`[processErrors]   - Ошибок при проверке: ${errorCount}`);
  console.log(`[processErrors]   - Всего обработано: ${processed}/${urls.length}`);
}

module.exports = {
  readErrorsFile,
  checkUrlStatus,
  processErrors
};
