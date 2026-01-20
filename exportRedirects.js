const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { initDatabase, closeDatabase, getRedirectsByPercent } = require('./db');

/**
 * Функция для запроса пользовательского ввода
 * @param {string} question - вопрос для пользователя
 * @returns {Promise<number>} введенное число
 */
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const num = parseFloat(answer);
      if (isNaN(num) || num < 0 || num > 100) {
        console.error('Ошибка: введите число от 0 до 100');
        process.exit(1);
      }
      resolve(num);
    });
  });
}

/**
 * Основная функция
 */
async function main() {
  try {
    // Запрашиваем минимальный процент
    const minPercent = await askQuestion('Укажите минимальный процент для выборки (0-100): ');
    
    console.log(`\nПоиск редиректов с процентом >= ${minPercent}%...`);
    
    // Инициализация БД
    initDatabase();
    
    // Получаем редиректы
    const redirects = getRedirectsByPercent(minPercent);
    
    console.log(`Найдено ${redirects.length} редиректов`);
    
    if (redirects.length === 0) {
      console.log('Нет редиректов, соответствующих заданному критерию');
      closeDatabase();
      return;
    }
    
    // Формируем объект {from_url: to_url}
    const result = {};
    for (const redirect of redirects) {
      result[redirect.from_url] = redirect.to_url;
    }
    
    // Сохраняем в result.json
    const outputFile = path.join(__dirname, 'result.json');
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
    
    console.log(`\n✓ Результат сохранен в ${outputFile}`);
    console.log(`  Всего записей: ${redirects.length}`);
    
    // Показываем статистику по процентам
    const percentStats = {};
    for (const redirect of redirects) {
      const percentRange = Math.floor(redirect.percent / 10) * 10;
      const key = `${percentRange}-${percentRange + 9}%`;
      percentStats[key] = (percentStats[key] || 0) + 1;
    }
    
    console.log('\nРаспределение по диапазонам процентов:');
    Object.keys(percentStats)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(range => {
        console.log(`  ${range}: ${percentStats[range]} записей`);
      });
    
  } catch (error) {
    console.error('Ошибка:', error);
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
