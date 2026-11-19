# syntax=docker/dockerfile:1
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
# SQLite de las pruebas requiere un módulo nativo; las aplicaciones usan MariaDB.
RUN apk add --no-cache python3 make g++ mariadb-client git
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY client/package.json client/package.json
COPY contracts/package.json contracts/package.json
RUN --mount=type=cache,target=/root/.npm npm ci
ENTRYPOINT ["npm"]
CMD ["run", "lint"]
