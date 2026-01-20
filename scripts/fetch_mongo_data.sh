#!/bin/bash

# Скрипт для экспорта данных из MongoDB на удаленном сервере
# Экспортирует коллекции product1cs и catalog1cs (поле code) в JSON файлы

# Определяем корневую директорию проекта
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Загрузка переменных из .env файла (если существует)
if [ -f "${PROJECT_ROOT}/.env" ]; then
    echo "Загрузка переменных из .env файла..."
    # Читаем .env файл построчно и экспортируем переменные
    set -a
    while IFS= read -r line || [ -n "$line" ]; do
        # Пропускаем комментарии и пустые строки
        if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "${line// }" ]]; then
            continue
        fi
        # Экспортируем переменную
        export "$line"
    done < "${PROJECT_ROOT}/.env"
    set +a
fi

# Конфигурация (значения по умолчанию, могут быть переопределены через .env или переменные окружения)
SSH_HOST="${SSH_HOST:-root@90.156.168.41}"
MONGO_CONTAINER="${MONGO_CONTAINER:-mongo_db}"
MONGO_DB="${MONGO_DB:-nest}"
COLLECTION_PRODUCTS="product1cs"
COLLECTION_CATALOG="catalog1cs"
DATA_DIR="${PROJECT_ROOT}/data"
PRODUCTS_FILE="${DATA_DIR}/nest.product1cs.json"
CATALOG_FILE="${DATA_DIR}/nest.catalog1cs.json"
DOCKER_COMPOSE_DIR="${DOCKER_COMPOSE_DIR:-/root/frizar}"
USE_DOCKER_COMPOSE=false  # Будет определена в check_connection

# Аутентификация MongoDB (из .env, переменных окружения или пусто)
MONGO_USERNAME="${MONGO_USERNAME:-}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"  # База данных для аутентификации (по умолчанию admin)

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Экспорт данных из MongoDB ===${NC}"

# Информация об аутентификации
if [ -z "$MONGO_USERNAME" ] || [ -z "$MONGO_PASSWORD" ]; then
    echo -e "${YELLOW}⚠ Аутентификация не задана${NC}"
    if [ -f "${PROJECT_ROOT}/.env" ]; then
        echo -e "${YELLOW}Файл .env найден, но переменные MONGO_USERNAME и MONGO_PASSWORD не загружены${NC}"
        echo -e "${YELLOW}Проверьте формат файла .env (должно быть: MONGO_USERNAME=value без пробелов вокруг =)${NC}"
    else
        echo -e "${YELLOW}Если MongoDB требует аутентификацию, задайте переменные в файле .env или через переменные окружения:${NC}"
        echo -e "  ${BLUE}Создайте файл .env в корне проекта с переменными MONGO_USERNAME и MONGO_PASSWORD${NC}"
    fi
    echo -e "  ${BLUE}Или: MONGO_USERNAME=username MONGO_PASSWORD=password bash scripts/fetch_mongo_data.sh${NC}"
    echo ""
else
    echo -e "${GREEN}✓ Аутентификация настроена (пользователь: ${MONGO_USERNAME})${NC}"
    echo ""
fi

# Проверка существования директории data
if [ ! -d "$DATA_DIR" ]; then
    echo -e "${YELLOW}Создаю директорию ${DATA_DIR}${NC}"
    mkdir -p "$DATA_DIR"
fi

# Функция для проверки доступности сервера и контейнера
check_connection() {
    echo -e "${BLUE}Проверка подключения к серверу...${NC}"
    
    # Проверка SSH подключения
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SSH_HOST" "echo 'SSH OK'" > /dev/null 2>&1; then
        echo -e "${RED}Ошибка: не удалось подключиться к серверу ${SSH_HOST}${NC}"
        echo -e "${YELLOW}Проверьте SSH ключи и доступность сервера${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ SSH подключение установлено${NC}"
    
    # Проверка docker-compose
    echo -e "${BLUE}Проверка docker-compose...${NC}"
    if ssh "$SSH_HOST" "cd ${DOCKER_COMPOSE_DIR} && docker-compose ps" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ docker-compose доступен в ${DOCKER_COMPOSE_DIR}${NC}"
        export USE_DOCKER_COMPOSE=true
    else
        echo -e "${YELLOW}⚠ docker-compose не найден, используем docker exec${NC}"
        export USE_DOCKER_COMPOSE=false
    fi
    
    # Проверка контейнера
    echo -e "${BLUE}Проверка контейнера MongoDB...${NC}"
    if [ "$USE_DOCKER_COMPOSE" = true ]; then
        if ssh "$SSH_HOST" "cd ${DOCKER_COMPOSE_DIR} && docker-compose ps ${MONGO_CONTAINER} | grep -q Up" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Контейнер ${MONGO_CONTAINER} запущен${NC}"
        else
            echo -e "${RED}Ошибка: контейнер ${MONGO_CONTAINER} не запущен${NC}"
            ssh "$SSH_HOST" "cd ${DOCKER_COMPOSE_DIR} && docker-compose ps"
            return 1
        fi
    else
        if ssh "$SSH_HOST" "docker ps --format '{{.Names}}' | grep -q '^${MONGO_CONTAINER}$'" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Контейнер ${MONGO_CONTAINER} запущен${NC}"
        else
            echo -e "${RED}Ошибка: контейнер ${MONGO_CONTAINER} не найден или не запущен${NC}"
            echo -e "${YELLOW}Доступные контейнеры:${NC}"
            ssh "$SSH_HOST" "docker ps --format '{{.Names}}'"
            return 1
        fi
    fi
    
    return 0
}

# Функция для выполнения команды в контейнере
run_docker_command() {
    local command=$1
    
    if [ "$USE_DOCKER_COMPOSE" = true ]; then
        ssh "$SSH_HOST" "cd ${DOCKER_COMPOSE_DIR} && docker-compose exec -T ${MONGO_CONTAINER} $command"
    else
        ssh "$SSH_HOST" "docker exec -i ${MONGO_CONTAINER} $command"
    fi
}

# Функция для построения аргументов аутентификации
build_auth_args() {
    local auth_args=""
    if [ -n "$MONGO_USERNAME" ] && [ -n "$MONGO_PASSWORD" ]; then
        auth_args="--username ${MONGO_USERNAME} --password ${MONGO_PASSWORD} --authenticationDatabase ${MONGO_AUTH_DB}"
    fi
    echo "$auth_args"
}

# Функция для экспорта коллекции через mongoexport
export_collection_mongoexport() {
    local collection=$1
    local output_file=$2
    local collection_name=$3
    
    echo -e "${YELLOW}Экспорт коллекции ${collection_name} через mongoexport...${NC}"
    
    # Строим команду с аутентификацией
    local auth_args=$(build_auth_args)
    local mongoexport_cmd="mongoexport --db ${MONGO_DB} --collection ${collection} --fields code --jsonArray --quiet"
    if [ -n "$auth_args" ]; then
        mongoexport_cmd="${mongoexport_cmd} ${auth_args}"
    fi
    
    # Выполняем экспорт через SSH и Docker
    local exit_code=0
    run_docker_command "$mongoexport_cmd" > "$output_file.tmp" 2>&1 || exit_code=$?
    
    # Сохраняем stderr отдельно для диагностики
    local error_output=$(cat "$output_file.tmp" 2>&1)
    
    # Проверяем результат
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Ошибка при выполнении mongoexport (код выхода: ${exit_code})${NC}"
        echo -e "${RED}Детали ошибки:${NC}"
        echo "$error_output"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    if [ ! -s "$output_file.tmp" ]; then
        echo -e "${RED}Ошибка: файл результата пуст${NC}"
        echo -e "${YELLOW}Вывод команды:${NC}"
        echo "$error_output"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    # Проверяем на ошибки в выводе
    if echo "$error_output" | grep -qiE "error|Error|ERROR|failed|Failed|FAILED"; then
        echo -e "${RED}Обнаружена ошибка в выводе:${NC}"
        echo "$error_output"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    return 0
}

# Функция для экспорта коллекции через mongosh (альтернативный метод)
export_collection_mongosh() {
    local collection=$1
    local output_file=$2
    local collection_name=$3
    
    echo -e "${YELLOW}Экспорт коллекции ${collection_name} через mongosh...${NC}"
    
    # Создаем JavaScript скрипт
    local js_code="JSON.stringify(db.getCollection('${collection}').find({}, {code: 1, _id: 0}).toArray())"
    
    # Строим команду с аутентификацией
    local mongosh_cmd="mongosh ${MONGO_DB} --quiet --eval \"${js_code}\""
    if [ -n "$MONGO_USERNAME" ] && [ -n "$MONGO_PASSWORD" ]; then
        mongosh_cmd="mongosh ${MONGO_DB} --username ${MONGO_USERNAME} --password ${MONGO_PASSWORD} --authenticationDatabase ${MONGO_AUTH_DB} --quiet --eval \"${js_code}\""
    fi
    
    # Выполняем через SSH и Docker
    local exit_code=0
    run_docker_command "$mongosh_cmd" > "$output_file.tmp" 2>&1 || exit_code=$?
    
    local error_output=$(cat "$output_file.tmp" 2>&1)
    
    # Проверяем результат
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Ошибка при выполнении mongosh (код выхода: ${exit_code})${NC}"
        echo -e "${RED}Детали ошибки:${NC}"
        echo "$error_output"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    if [ ! -s "$output_file.tmp" ]; then
        echo -e "${RED}Ошибка: файл результата пуст${NC}"
        echo -e "${YELLOW}Вывод команды:${NC}"
        echo "$error_output"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    # Проверяем на ошибки
    if echo "$error_output" | grep -qiE "error|Error|ERROR|failed|Failed|FAILED|MongoServerError"; then
        echo -e "${RED}Обнаружена ошибка в выводе:${NC}"
        echo "$error_output"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    return 0
}

# Функция для экспорта коллекции (универсальная)
export_collection() {
    local collection=$1
    local output_file=$2
    local collection_name=$3
    
    # Пробуем сначала mongoexport
    if export_collection_mongoexport "$collection" "$output_file" "$collection_name"; then
        echo -e "${GREEN}✓ Использован mongoexport${NC}"
    # Если не получилось, пробуем mongosh
    elif export_collection_mongosh "$collection" "$output_file" "$collection_name"; then
        echo -e "${GREEN}✓ Использован mongosh${NC}"
    else
        echo -e "${RED}✗ Ошибка: не удалось экспортировать коллекцию ${collection_name}${NC}"
        echo -e "${YELLOW}Попробованы оба метода (mongoexport и mongosh)${NC}"
        echo -e "${YELLOW}Проверьте:${NC}"
        echo -e "  - Подключение к серверу ${SSH_HOST}"
        echo -e "  - Доступность контейнера ${MONGO_CONTAINER}"
        echo -e "  - Существование базы данных ${MONGO_DB}"
        echo -e "  - Существование коллекции ${collection}"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    # Проверяем, что это валидный JSON массив
    if ! python3 -m json.tool "$output_file.tmp" > /dev/null 2>&1; then
        echo -e "${RED}Ошибка: получен невалидный JSON для коллекции ${collection_name}${NC}"
        echo -e "${YELLOW}Содержимое ответа (первые 30 строк):${NC}"
        head -30 "$output_file.tmp"
        rm -f "$output_file.tmp"
        return 1
    fi
    
    # Сохраняем результат
    mv "$output_file.tmp" "$output_file"
    echo -e "${GREEN}✓ Коллекция ${collection_name} экспортирована в ${output_file}${NC}"
    
    # Показываем статистику
    local count=$(python3 -c "import json; print(len(json.load(open('$output_file'))))" 2>/dev/null || echo "N/A")
    echo -e "  Записей: ${count}"
}

# Проверка подключения перед началом работы
if ! check_connection; then
    echo -e "${RED}Не удалось установить подключение. Выход.${NC}"
    exit 1
fi

echo ""

# Экспорт коллекции products
if ! export_collection "$COLLECTION_PRODUCTS" "$PRODUCTS_FILE" "product1cs"; then
    echo -e "${RED}Не удалось экспортировать коллекцию product1cs${NC}"
    exit 1
fi

echo ""

# Экспорт коллекции catalog
if ! export_collection "$COLLECTION_CATALOG" "$CATALOG_FILE" "catalog1cs"; then
    echo -e "${RED}Не удалось экспортировать коллекцию catalog1cs${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Экспорт завершен успешно ===${NC}"
