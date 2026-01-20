const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
    const choice = await askQuestion('\nВыберите действие (0-4): ');
    
    switch (choice.trim()) {
      case '1':
        executeCommand('npm run fetch-data', 'Скачивание коллекций с сервера');
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
        
      case '0':
        console.log('\nДо свидания!');
        rl.close();
        process.exit(0);
        break;
        
      default:
        console.log('\n⚠ Неверный выбор. Пожалуйста, выберите число от 0 до 4.');
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
