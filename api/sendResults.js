require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Отправка результатов на сервер
 */
async function sendResultsToServer() {
  const resultFilePath = path.join(__dirname, '..', 'result.json');
  
  // Проверяем наличие файла
  if (!fs.existsSync(resultFilePath)) {
    console.log('✗ Файл result.json не найден');
    console.log('  Сначала выполните пункт 3 для создания файла с результатами');
    return;
  }
  
  // Проверяем наличие API ключа
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    console.log('✗ API_KEY не установлен в файле .env');
    console.log('  Пожалуйста, добавьте API_KEY в файл .env');
    return;
  }
  
  // Проверяем наличие API_URL
  const apiUrl = process.env.API_URL;
  console.log(apiUrl,"apiURL")
  if (!apiUrl || apiUrl.trim() === '') {
    console.log('✗ API_URL не установлен в файле .env');
    console.log('  Пожалуйста, добавьте API_URL в файл .env');
    return;
  }
  
  try {
    // Читаем result.json
    const resultContent = fs.readFileSync(resultFilePath, 'utf-8');
    const redirectsData = JSON.parse(resultContent);
    
    // Проверяем формат данных
    if (!Array.isArray(redirectsData)) {
      console.log('✗ Неверный формат данных в result.json');
      console.log('  Ожидается массив объектов [{from, to, precent}, ...]');
      return;
    }
    
    if (redirectsData.length === 0) {
      console.log('✗ Нет данных для отправки');
      return;
    }
    
    // Проверяем структуру первого элемента
    if (redirectsData.length > 0) {
      const firstItem = redirectsData[0];
      if (!firstItem.from || !firstItem.to) {
        console.log('✗ Неверный формат данных в result.json');
        console.log('  Каждый объект должен содержать поля: from, to, precent');
        return;
      }
    }
    
    // Преобразуем полные URL в пути для API
    // result.json содержит полные URL с BASE_URL, но API ожидает пути
    const redirects = redirectsData.map(item => {
      // Извлекаем путь из полного URL (если это URL) или используем как есть (если уже путь)
      const fromPath = item.from.startsWith('http') 
        ? item.from.replace(/^https?:\/\/[^\/]+/, '') || '/'
        : item.from;
      const toPath = item.to.startsWith('http')
        ? item.to.replace(/^https?:\/\/[^\/]+/, '') || '/'
        : item.to;
      
      return {
        from: fromPath,
        to: toPath,
        precent: item.precent || 100
      };
    });
    
    console.log(`\nОтправка ${redirects.length} редиректов на сервер...`);
    console.log('-'.repeat(50));
    
    // Отправляем на сервер
    const response = await axios.post(
      apiUrl,
      redirects,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000 // 30 секунд таймаут
      }
    );
    
    console.log('-'.repeat(50));
    console.log('✓ Данные успешно отправлены на сервер');
    console.log(`  Создано: ${response.data.created || 0}`);
    console.log(`  Обновлено: ${response.data.updated || 0}`);
    console.log(`  Всего: ${response.data.total || redirects.length}`);
    
  } catch (error) {
    console.log('-'.repeat(50));
    console.error('✗ Ошибка при отправке данных на сервер');
    
    if (error.response) {
      // Сервер ответил с кодом ошибки
      console.error(`  Статус: ${error.response.status}`);
      console.error(`  Сообщение: ${error.response.data?.message || error.response.statusText}`);
      if (error.response.data) {
        console.error(`  Данные: ${JSON.stringify(error.response.data)}`);
      }
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      console.error('  Не удалось получить ответ от сервера');
      console.error(`  ${error.message}`);
    } else {
      // Ошибка при настройке запроса
      console.error(`  ${error.message}`);
    }
  }
}

module.exports = { sendResultsToServer };
