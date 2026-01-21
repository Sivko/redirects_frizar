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
 * Показать главное меню
 */
function showMenu() {
  console.log('\n' + '='.repeat(50));
  console.log('Главное меню');
  console.log('='.repeat(50));
  console.log('1. Скачать коллекции с сервера');
  console.log('2. Запустить поиск релевантных редиректов');
  console.log('3. Выгрузить результат в файл "result.json"');
  console.log('4. Очистить данные');
  console.log('5. Преобразовать CSV в JSON');
  console.log('6. Отправить результаты на сервер');
  console.log('0. Выход');
  console.log('='.repeat(50));
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
  console.log('\n⚠ ВНИМАНИЕ: Будут удалены следующие файлы:');
  console.log('  - redirects.db (и связанные файлы)');
  console.log('  - result.json');
  console.log('  - data/nest.catalog1cs.json');
  console.log('  - data/nest.product1cs.json');
  
  const confirm = await askQuestion('\nВы уверены? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('Очистка отменена');
    return;
  }
  
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
  
  while (true) {
    showMenu();
    const choice = await askQuestion('\nВыберите действие (0-6): ');
    
    switch (choice.trim()) {
      case '1':
        try {
          await fetchCollections();
        } catch (error) {
          console.error('✗ Ошибка при скачивании коллекций');
        }
        break;
        
      case '2':
        executeCommand('npm start', 'Поиск релевантных редиректов');
        break;
        
      case '3':
        executeCommand('npm run export', 'Выгрузка результата в файл');
        break;
        
      case '4':
        await clearData();
        break;
        
      case '5':
        await convertCsvToJson();
        break;
        
      case '6':
        await sendResultsToServer();
        break;
        
      case '0':
        console.log('\nДо свидания!');
        rl.close();
        process.exit(0);
        break;
        
      default:
        console.log('\n⚠ Неверный выбор. Пожалуйста, выберите число от 0 до 6.');
        break;
    }
    
    // Пауза перед показом меню снова
    if (choice.trim() !== '0') {
      await askQuestion('\nНажмите Enter для продолжения...');
    }
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
