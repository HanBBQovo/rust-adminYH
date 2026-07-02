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
assertIncludes(webDockerfile, 'RUN npm ci', 'desktop-web Dockerfile must use package-lock based installs')
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
assertIncludes(compose, 'VITE_API_BASE_URL: /api', 'compose web build must use nginx /api proxy')
assertIncludes(compose, '- "16824:16824"', 'compose must expose the API health port for CI checks')
assertIncludes(compose, '- "18080:80"', 'compose must expose the web health port for CI checks')

assertIncludes(dockerGate, 'docker version', 'Docker gate diagnostics must print docker version')
assertIncludes(dockerGate, 'docker compose version', 'Docker gate diagnostics must print compose version')
assertIncludes(dockerGate, 'redact_url', 'Docker gate must redact database credentials in diagnostics')
assertIncludes(dockerGate, 'logs --tail=200 mysql admin-api desktop-web', 'Docker gate must include service logs on failure')
assertIncludes(dockerGate, 'docker build \\', 'Docker gate must build images before compose smoke')
assertIncludes(dockerGate, 'curl --fail --silent --show-error "$API_URL"', 'Docker gate must check API health')
assertIncludes(dockerGate, 'curl --fail --silent --show-error "$WEB_URL"', 'Docker gate must check web health')
assertIncludes(dockerGate, 'down --volumes --remove-orphans', 'Docker gate must clean compose volumes and orphans')

assertIncludes(checkAll, 'scripts/test-docker-contract.mjs', 'check-all must always run the lightweight Docker contract before optional Docker build')
assertIncludes(checkAll, 'RUN_DOCKER', 'check-all must keep the heavy Docker build behind RUN_DOCKER=true')

console.log('Docker contract OK')
