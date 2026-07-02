#!/usr/bin/env node
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Docker contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

const apiDockerfile = read('Dockerfile.admin-api')
const webDockerfile = read('Dockerfile.desktop-web')
const compose = read('docker-compose.ci.yml')
const nginx = read('docker/nginx/desktop-web.conf')
const dockerGate = read('scripts/test-docker.sh')
const checkAll = read('scripts/check-all.sh')
const dockerSeed = read('scripts/seed-docker-e2e.sql')
const playwrightConfig = read('apps/desktop/web/playwright.config.ts')
const realApiSpec = read('apps/desktop/web/e2e/real-api.spec.ts')

assertIncludes(apiDockerfile, 'ARG RUST_IMAGE=rust:1.88-bookworm', 'admin-api Dockerfile must pin the default Rust builder image')
assertIncludes(apiDockerfile, 'ARG RUNTIME_IMAGE=debian:bookworm-slim', 'admin-api Dockerfile must pin the default Debian runtime image')
assertIncludes(apiDockerfile, 'RUN cargo build --release -p admin-api', 'admin-api Dockerfile must build only the admin-api release binary')
assertIncludes(apiDockerfile, 'USER 10001:10001', 'admin-api runtime must not run as root')
assertIncludes(apiDockerfile, 'APP_HTTP__HOST=0.0.0.0', 'admin-api container must bind all interfaces')
assertIncludes(apiDockerfile, 'APP_HTTP__PORT=16824', 'admin-api container must expose the fixed API port')
assertIncludes(apiDockerfile, 'APP_LOGGING__JSON_LOGS=true', 'admin-api container must use JSON logs')
assertIncludes(apiDockerfile, 'APP_STORAGE__AVATAR_DIR=/app/uploads/avatar', 'admin-api container must use the mounted avatar storage path')
assertIncludes(apiDockerfile, 'DATABASE_MIGRATE_ON_START=false', 'admin-api image default must not auto-migrate outside compose/CI')
assertIncludes(apiDockerfile, 'EXPOSE 16824', 'admin-api image must expose the API port')
assertIncludes(apiDockerfile, 'ENTRYPOINT ["/usr/local/bin/admin-api"]', 'admin-api image must run the compiled binary directly')

assertIncludes(webDockerfile, 'ARG NODE_IMAGE=node:20-slim', 'desktop-web Dockerfile must pin the default Node builder image')
assertIncludes(webDockerfile, 'ARG NGINX_IMAGE=nginx:1.27-alpine', 'desktop-web Dockerfile must pin the default nginx runtime image')
assertIncludes(webDockerfile, 'ARG NPM_REGISTRY=https://registry.npmjs.org', 'desktop-web Dockerfile must define a stable npm registry override')
assertIncludes(webDockerfile, '--replace-registry-host=always', 'desktop-web Dockerfile must avoid mixed lockfile registry hosts during npm ci')
assertIncludes(webDockerfile, 'test -x node_modules/.bin/tsc', 'desktop-web Dockerfile must hard-fail when TypeScript was not installed')
assertIncludes(webDockerfile, 'test -x node_modules/.bin/vite', 'desktop-web Dockerfile must hard-fail when Vite was not installed')
assertIncludes(webDockerfile, 'ARG VITE_API_BASE_URL=/api', 'desktop-web build must default to the nginx /api proxy')
assertIncludes(webDockerfile, 'ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}', 'desktop-web Dockerfile must pass Vite API base URL into build')
assertIncludes(webDockerfile, 'RUN npm run build', 'desktop-web Dockerfile must build the production frontend artifact')
assertIncludes(webDockerfile, 'COPY docker/nginx/desktop-web.conf /etc/nginx/conf.d/default.conf', 'desktop-web image must install the checked nginx config')
assertIncludes(webDockerfile, 'COPY --from=builder /app/apps/desktop/web/dist /usr/share/nginx/html', 'desktop-web image must serve the built dist directory')
assertIncludes(webDockerfile, 'EXPOSE 80', 'desktop-web image must expose nginx port 80')

assertIncludes(nginx, 'listen 80;', 'nginx must listen on container port 80')
assertIncludes(nginx, 'root /usr/share/nginx/html;', 'nginx must serve the built frontend artifact')
assertIncludes(nginx, 'location /api/', 'nginx must define an /api proxy location')
assertIncludes(nginx, 'proxy_pass http://admin-api:16824/api/;', 'nginx /api proxy must target the compose API service and fixed port')
assertIncludes(nginx, 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'nginx proxy must preserve forwarded-for headers')
assertIncludes(nginx, 'try_files $uri $uri/ /index.html;', 'nginx must preserve SPA history fallback')

assertIncludes(compose, 'image: ${MYSQL_IMAGE:-mysql:8.0}', 'compose must pin the default MySQL image')
assertIncludes(compose, '--character-set-server=utf8mb4', 'compose MySQL must use utf8mb4 charset')
assertIncludes(compose, '--collation-server=utf8mb4_unicode_ci', 'compose MySQL must use utf8mb4 unicode collation')
assertIncludes(compose, 'mysqladmin ping -h 127.0.0.1', 'compose MySQL must define a healthcheck')
assertIncludes(compose, 'condition: service_healthy', 'admin-api must wait for healthy MySQL')
assertIncludes(compose, 'APP_HTTP__PORT: 16824', 'compose admin-api must use the fixed API port')
assertIncludes(compose, 'DATABASE_URL: mysql://admin_yh:admin_yh@mysql:3306/admin_yh', 'compose admin-api must connect to the compose MySQL service')
assertIncludes(compose, 'DATABASE_MIGRATE_ON_START: "true"', 'compose CI must run database migrations on startup')
assertIncludes(compose, 'NPM_REGISTRY: ${NPM_REGISTRY:-https://registry.npmjs.org}', 'compose web build must pass the stable npm registry override')
assertIncludes(compose, 'VITE_API_BASE_URL: /api', 'compose web build must use nginx /api proxy')
assertIncludes(compose, 'wget -qO- http://127.0.0.1/', 'compose desktop-web must define an nginx healthcheck')
assertIncludes(compose, '- "16824:16824"', 'compose must expose the API health port for CI checks')
assertIncludes(compose, '- "${WEB_PORT:-18080}:80"', 'compose must expose a configurable web health port for CI checks')

assertIncludes(dockerGate, 'docker version', 'Docker gate diagnostics must print docker version')
assertIncludes(dockerGate, 'docker compose version', 'Docker gate diagnostics must print compose version')
assertIncludes(dockerGate, 'redact_url', 'Docker gate must redact database credentials in diagnostics')
assertIncludes(dockerGate, 'logs --tail=200 mysql admin-api desktop-web', 'Docker gate must include service logs on failure')
assertIncludes(dockerGate, 'docker build \\', 'Docker gate must build images before compose smoke')
assertIncludes(dockerGate, 'curl --fail --silent --show-error "$API_URL"', 'Docker gate must check API health')
assertIncludes(dockerGate, 'curl --fail --silent --show-error "$WEB_URL"', 'Docker gate must check web health')
assertIncludes(dockerGate, 'WEB_PORT="${WEB_PORT:-18080}"', 'Docker gate must define a configurable web host port')
assertIncludes(dockerGate, 'NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"', 'Docker gate must define a stable npm registry override')
assertIncludes(dockerGate, '--build-arg NPM_REGISTRY="$NPM_REGISTRY"', 'Docker gate must pass the npm registry override into web image builds')
assertIncludes(dockerGate, 'npm_registry=${NPM_REGISTRY}', 'Docker gate diagnostics must print the npm registry override')
assertIncludes(dockerGate, 'web_port=${WEB_PORT}', 'Docker gate diagnostics must print the selected web host port')
assertIncludes(dockerGate, 'RUN_DOCKER_E2E="${RUN_DOCKER_E2E:-false}"', 'Docker gate must keep real browser E2E behind RUN_DOCKER_E2E=true')
assertIncludes(dockerGate, 'run_docker_e2e=${RUN_DOCKER_E2E}', 'Docker gate diagnostics must print the real E2E toggle')
assertIncludes(dockerGate, 'curl --fail --silent --show-error "${WEB_URL%/}${ASSET_PATH}"', 'Docker gate must check a built frontend asset')
assertIncludes(dockerGate, 'curl --fail --silent --show-error "$WEB_API_URL"', 'Docker gate must check nginx /api proxy health')
assertIncludes(dockerGate, 'scripts/seed-docker-e2e.sql', 'Docker gate must seed MySQL before real API browser E2E')
assertIncludes(dockerGate, 'PLAYWRIGHT_BASE_URL="${WEB_URL%/}" REAL_API_E2E=true npm run e2e -- e2e/real-api.spec.ts', 'Docker gate must run Playwright against the compose nginx web URL')
assertIncludes(dockerGate, 'down --volumes --remove-orphans', 'Docker gate must clean compose volumes and orphans')

assertIncludes(checkAll, 'scripts/test-docker-contract.mjs', 'check-all must always run the lightweight Docker contract before optional Docker build')
assertIncludes(checkAll, 'RUN_DOCKER', 'check-all must keep the heavy Docker build behind RUN_DOCKER=true')
assertIncludes(checkAll, 'RUN_DOCKER_E2E', 'release gate must require Docker Web + Rust API + MySQL browser E2E')

assertIncludes(dockerSeed, "INSERT INTO `user`", 'Docker E2E seed must create a login user')
assertIncludes(dockerSeed, '0192023a7bbd73250516f069df18b500', 'Docker E2E seed must use the legacy admin123 MD5 hash')
assertIncludes(dockerSeed, 'YH-DOCKER-0001', 'Docker E2E seed must create a stable order fixture')
assertIncludes(dockerSeed, "INSERT INTO `receipt`", 'Docker E2E seed must create a receipt fixture')
assertIncludes(dockerSeed, "INSERT INTO `role_permission`", 'Docker E2E seed must grant menu permissions')

assertIncludes(playwrightConfig, 'PLAYWRIGHT_BASE_URL', 'Playwright config must support an externally served Docker web URL')
assertIncludes(playwrightConfig, 'useExternalServer', 'Playwright config must skip starting Vite when an external server is provided')

assertIncludes(realApiSpec, "REAL_API_E2E !== 'true'", 'real API spec must stay opt-in outside Docker E2E')
assertIncludes(realApiSpec, 'YH-DOCKER-0001', 'real API spec must assert seeded order data from Rust API')
assertIncludes(realApiSpec, 'Docker 发货公司', 'real API spec must assert seeded company data from Rust API')

console.log('Docker contract OK')
