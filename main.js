require('dotenv').config();
const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fetchCollections } = require('./api/fetchCollections');
const { sendResultsToServer } = require('./api/sendResults');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Функция для запроса пользовательского ввода
 * @param {string} question - вопрос для пользователя
 * @returns {Promise<string>} ответ пользователя
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}


/**
 * Выполнить команду
 * @param {string} command - команда для выполнения
 * @param {string} description - описание команды
 */
function executeCommand(command, description) {
  console.log(`\n${description}...`);
  console.log('-'.repeat(50));
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('-'.repeat(50));
    console.log(`✓ ${description} завершено успешно`);
  } catch (error) {
    console.log('-'.repeat(50));
    console.error(`✗ Ошибка при выполнении: ${description}`);
    console.error(error.message);
  }
}

/**
 * Преобразование CSV в JSON
 */
async function convertCsvToJson() {
  const dataDir = path.join(__dirname, 'data');
  
  // Найти первый CSV файл
  let csvFile = null;
  try {
    const files = fs.readdirSync(dataDir);
    csvFile = files.find(file => file.toLowerCase().endsWith('.csv'));
    
    if (!csvFile) {
      console.log('✗ CSV файлы не найдены в директории /data');
      return;
    }
    
    console.log(`✓ Найден CSV файл: ${csvFile}`);
  } catch (error) {
    console.error(`✗ Ошибка при чтении директории /data: ${error.message}`);
    return;
  }
  
  const csvPath = path.join(dataDir, csvFile);
  
  try {
    // Читаем CSV файл
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.log('✗ CSV файл пуст или содержит только заголовки');
      return;
    }
    
    // Парсим заголовки
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const urlIndex = headers.indexOf('url');
    const httpCodeIndex = headers.indexOf('currentHttpCode');
    
    if (urlIndex === -1 || httpCodeIndex === -1) {
      console.log('✗ CSV файл не содержит необходимые колонки (url, currentHttpCode)');
      return;
    }
    
    // Парсим строки и фильтруем 404 ошибки
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Простой парсинг CSV с учетом кавычек
      const values = [];
      let currentValue = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim()); // Последнее значение
      
      // Убираем кавычки из значений
      const cleanValues = values.map(v => v.replace(/^"|"$/g, ''));
      
      if (cleanValues.length > httpCodeIndex) {
        const httpCode = cleanValues[httpCodeIndex];
        if (httpCode === '404') {
          const url = cleanValues[urlIndex] || '';
          if (url) {
            errors.push({
              url: `https://frizar.ru${url}`
            });
          }
        }
      }
    }
    
    // Записываем результат в data/errors.json
    const outputPath = path.join(dataDir, 'errors.json');
    fs.writeFileSync(outputPath, JSON.stringify(errors, null, 2), 'utf-8');
    
    console.log(`✓ Найдено ${errors.length} записей с ошибкой 404`);
    console.log(`✓ Результат записан в ${outputPath}`);
    
  } catch (error) {
    console.error(`✗ Ошибка при обработке CSV файла: ${error.message}`);
  }
}

/**
 * Очистка данных
 */
async function clearData() {
  const filesToDelete = [
    'redirects.db',
    'redirects.db-shm',
    'redirects.db-wal',
    'result.json',
    'data/nest.catalog1cs.json',
    'data/nest.product1cs.json'
  ];
  
  let deletedCount = 0;
  let notFoundCount = 0;
  
  for (const file of filesToDelete) {
    const filePath = path.join(__dirname, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✓ Удален: ${file}`);
        deletedCount++;
      } else {
        console.log(`- Не найден: ${file}`);
        notFoundCount++;
      }
    } catch (error) {
      console.error(`✗ Ошибка при удалении ${file}: ${error.message}`);
    }
  }
  
  console.log(`\nОчистка завершена: удалено ${deletedCount} файлов, не найдено ${notFoundCount} файлов`);
}

/**
 * Главная функция
 */
async function main() {
  console.log('\n' + '='.repeat(50));
  console.log('Система обработки редиректов');
  console.log('='.repeat(50));
  
  try {
    // Шаг 1: Очистить данные
    console.log('\n' + '='.repeat(50));
    console.log('Шаг 1: Очистка данных');
    console.log('='.repeat(50));
    console.log('⚠ ВНИМАНИЕ: Будут удалены следующие файлы:');
    console.log('  - redirects.db (и связанные файлы)');
    console.log('  - result.json');
    console.log('  - data/nest.catalog1cs.json');
    console.log('  - data/nest.product1cs.json');
    
    while (true) {
      const confirmClear = await askQuestion('\nПродолжить? (1 - Да, 2 - Нет): ');
      
      if (confirmClear.trim() === '1') {
        break;
      } else if (confirmClear.trim() === '2') {
        console.log('Очистка отменена. Программа завершена.');
        rl.close();
        process.exit(0);
        return;
      } else {
        console.log('⚠ Неверный выбор. Введите 1 или 2.');
      }
    }
    
    await clearData();
    await askQuestion('\nНажмите Enter для продолжения...');
    
    // Шаг 2: Скачать коллекции с сервера
    console.log('\n' + '='.repeat(50));
    console.log('Шаг 2: Скачивание коллекций с сервера');
    console.log('='.repeat(50));
    await askQuestion('Нажмите Enter для начала скачивания...');
    
    try {
      await fetchCollections();
      console.log('✓ Скачивание коллекций завершено успешно');
    } catch (error) {
      console.error('✗ Ошибка при скачивании коллекций:', error.message);
      throw error;
    }
    
    await askQuestion('\nНажмите Enter для продолжения...');
    
    // Шаг 3: Преобразовать CSV в JSON
    console.log('\n' + '='.repeat(50));
    console.log('Шаг 3: Преобразование CSV в JSON');
    console.log('='.repeat(50));
    await askQuestion('Нажмите Enter для начала преобразования...');
    
    await convertCsvToJson();
    await askQuestion('\nНажмите Enter для продолжения...');
    
    // Шаг 4: Запустить поиск релевантных редиректов
    console.log('\n' + '='.repeat(50));
    console.log('Шаг 4: Поиск релевантных редиректов');
    console.log('='.repeat(50));
    await askQuestion('Нажмите Enter для начала поиска...');
    
    executeCommand('npm start', 'Поиск релевантных редиректов');
    await askQuestion('\nНажмите Enter для продолжения...');
    
    // Шаг 5: Выгрузить результат в файл "result.json"
    console.log('\n' + '='.repeat(50));
    console.log('Шаг 5: Выгрузка результата в файл "result.json"');
    console.log('='.repeat(50));
    await askQuestion('Нажмите Enter для начала выгрузки...');
    
    executeCommand('npm run export', 'Выгрузка результата в файл');
    await askQuestion('\nНажмите Enter для продолжения...');
    
    // Шаг 6: Отправить результаты на сервер?
    console.log('\n' + '='.repeat(50));
    console.log('Шаг 6: Отправка результатов на сервер');
    console.log('='.repeat(50));
    
    while (true) {
      const sendChoice = await askQuestion('Отправить результаты на сервер? (1 - Да, 2 - Нет): ');
      
      if (sendChoice.trim() === '1') {
        try {
          await sendResultsToServer();
          console.log('✓ Результаты успешно отправлены на сервер');
        } catch (error) {
          console.error('✗ Ошибка при отправке результатов:', error.message);
        }
        break;
      } else if (sendChoice.trim() === '2') {
        console.log('Отправка результатов пропущена');
        break;
      } else {
        console.log('⚠ Неверный выбор. Введите 1 или 2.');
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Все шаги выполнены успешно!');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n✗ Критическая ошибка:', error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Обработка выхода
rl.on('close', () => {
  console.log('\nПрограмма завершена');
  process.exit(0);
});

// Обработка ошибок
process.on('SIGINT', () => {
  console.log('\n\nПрограмма прервана пользователем');
  rl.close();
  process.exit(0);
});

// Запуск
if (require.main === module) {
  main().catch((error) => {
    console.error('Критическая ошибка:', error);
    rl.close();
    process.exit(1);
  });
}

module.exports = { main };
