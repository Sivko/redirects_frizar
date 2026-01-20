const levenshtein = require('fast-levenshtein');

/**
 * Нормализация строки для сравнения
 * - Удаление символов "x" и "kh" (регистронезависимо)
 * - Приведение к нижнему регистру
 * @param {string} str - исходная строка
 * @returns {string} нормализованная строка
 */
function normalizeString(str) {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .replace(/x/gi, '')
    .replace(/kh/gi, '');
}

/**
 * Расчет процента соответствия на основе расстояния Левенштейна
 * @param {string} str1 - первая строка
 * @param {string} str2 - вторая строка
 * @returns {number} процент соответствия (0-100)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  if (normalized1 === normalized2) return 100;
  
  const maxLength = Math.max(normalized1.length, normalized2.length);
  if (maxLength === 0) return 100;
  
  const distance = levenshtein.get(normalized1, normalized2);
  const percent = (1 - distance / maxLength) * 100;
  
  return Math.max(0, Math.min(100, percent));
}

/**
 * Поиск лучшего соответствия в массиве кодов
 * @param {string} searchCode - код для поиска
 * @param {Array<{code: string}>} codes - массив объектов с полем code
 * @returns {{code: string, percent: number}|null} лучший результат или null
 */
function findBestMatch(searchCode, codes) {
  if (!searchCode || !codes || codes.length === 0) {
    return null;
  }
  
  let bestMatch = null;
  let bestPercent = 0;
  
  for (const item of codes) {
    if (!item.code) continue;
    
    const percent = calculateSimilarity(searchCode, item.code);
    
    if (percent > bestPercent) {
      bestPercent = percent;
      bestMatch = {
        code: item.code,
        percent: percent
      };
    }
  }
  
  return bestMatch;
}

/**
 * Поиск лучшего соответствия в массиве кодов (синхронная версия для больших массивов)
 * Оптимизирована для работы с большими объемами данных
 * @param {string} searchCode - код для поиска
 * @param {Array<{code: string}>} codes - массив объектов с полем code
 * @returns {{code: string, percent: number}|null} лучший результат или null
 */
function findBestMatchOptimized(searchCode, codes) {
  return findBestMatch(searchCode, codes);
}

module.exports = {
  normalizeString,
  calculateSimilarity,
  findBestMatch,
  findBestMatchOptimized
};
