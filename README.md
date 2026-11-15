# tracking-notifier

Microservicio que recibe cambios de estado de guias de envio, los guarda por cliente (tenant) y
notifica al sistema de cada cliente mediante un webhook, sin perder eventos.

- **Stack:** Node.js 22, NestJS 11, TypeScript, PostgreSQL 16, TypeORM (solo en la capa de
  infraestructura), Jest + Testcontainers.
- **Arquitectura:** hexagonal (puertos y adaptadores). El dominio y los casos de uso no importan
  Nest, TypeORM ni Express; ESLint lo hace cumplir.
- **Idea central:** _outbox transaccional_. Evento y notificacion pendiente se guardan en la misma
  transaccion; un worker entrega despues. Ver [`docs/adr-001.md`](docs/adr-001.md).

## Como correrlo

Requisitos: Docker (con Compose). Para las pruebas ademas Node 22 (`.nvmrc`).

```bash
docker compose up --build
```

Levanta tres servicios: `api` (http://localhost:8088), `db` (PostgreSQL) y `webhook-receiver`
(http://localhost:9099), un cliente de prueba que imprime en consola cada webhook que recibe. Las
migraciones se aplican solas al arrancar. Los puertos se cambian con `API_PORT` y `RECEIVER_PORT`.

### Probarlo con curl

```bash
# Funcion auxiliar valida en bash y zsh (macOS). No uses una variable con las cabeceras sin
# comillas: zsh no la separa en palabras y curl envia una cabecera mal formada (400 sin cuerpo).
api() { curl -s "$@" -H 'X-Tenant-Id: acme' -H 'Content-Type: application/json'; }

# 1. Configurar el webhook del tenant (el receptor de prueba corre dentro de la red de compose).
#    La primera vez la respuesta incluye `secreto`, la clave de firma HMAC: no se vuelve a mostrar.
api -X PUT localhost:8088/webhook -d '{"url":"http://webhook-receiver:9000/hook"}'

# 2. Registrar eventos de la guia GUIA-1001
api -X POST localhost:8088/guias/GUIA-1001/eventos -d '{
  "eventId":"3f1c9c1e-6a53-4a4c-9f58-0b1c2d3e4f50","estado":"CREADA",
  "fechaEvento":"2026-01-15T14:00:00Z","observacion":"Tarjeta de prueba"}'
api -X POST localhost:8088/guias/GUIA-1001/eventos -d '{
  "eventId":"8a2d4b6c-1e3f-4a5b-8c7d-9e0f1a2b3c4d","estado":"EN_RUTA",
  "fechaEvento":"2026-01-15T15:00:00Z"}'

# 3. Repetir el mismo eventId: responde 200 con la cabecera Idempotent-Replayed y no duplica nada
api -i -X POST localhost:8088/guias/GUIA-1001/eventos -d '{
  "eventId":"3f1c9c1e-6a53-4a4c-9f58-0b1c2d3e4f50","estado":"CREADA",
  "fechaEvento":"2026-01-15T14:00:00Z","observacion":"Tarjeta de prueba"}'

# 4. Historial y notificaciones
api localhost:8088/guias/GUIA-1001
api "localhost:8088/notificaciones?estado=ENVIADA"

# 5. Otro tenant no ve la guia (404)
curl -s localhost:8088/guias/GUIA-1001 -H 'X-Tenant-Id: otro-cliente'

# 6. Mirar lo que recibio el cliente
docker compose logs webhook-receiver
```

Para ver los reintentos, apunta el webhook a otra ruta del receptor y registra un evento:

| URL del webhook                      | Comportamiento del receptor                                      |
| ------------------------------------ | ---------------------------------------------------------------- |
| `http://webhook-receiver:9000/hook`  | 200 siempre                                                      |
| `http://webhook-receiver:9000/flaky` | falla los 2 primeros intentos de cada evento y luego 200         |
| `http://webhook-receiver:9000/fail`  | 500 siempre: tras 5 intentos queda `FALLIDA` (`?estado=FALLIDA`) |
| `http://webhook-receiver:9000/slow`  | responde a los 10 s: supera el timeout de 5 s                    |

La espera base entre reintentos es 1 s (`WEBHOOK_BACKOFF_BASE_MS`), por lo que 5 intentos tardan
unos 15 s como maximo.

### Pruebas

```bash
npm ci
npm test              # todo: unitarias + integracion
npm run test:unit     # solo dominio y casos de uso (sin Docker)
npm run lint && npm run typecheck
```

Las pruebas de integracion levantan un PostgreSQL real con Testcontainers (Docker debe estar
abierto). Si prefieres un servidor propio: `TEST_DATABASE_URL=postgres://user:pass@localhost:5432/postgres npm test`
(cada archivo crea y elimina su propia base de datos).

## API

Todas las rutas (salvo `/health`) exigen la cabecera `X-Tenant-Id` (1 a 64 caracteres
`[A-Za-z0-9_-]`); se asume que ya la valido un API Gateway.

| Metodo y ruta                      | Descripcion                                                                                                                                                                                    | Respuestas                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /guias/{numeroGuia}/eventos` | Registra un evento de estado. Cuerpo: `eventId` (UUID), `estado` (`CREADA`, `EN_RUTA`, `ENTREGADA`, `DEVUELTA`), `fechaEvento` (ISO 8601 con zona horaria), `observacion` (opcional, max. 500) | 201 creado, 200 repeticion idempotente, 400 validacion, 409 transicion invalida / fuera de orden / `eventId` reutilizado con otro contenido |
| `GET /guias/{numeroGuia}`          | Estado actual y eventos en orden cronologico                                                                                                                                                   | 200, 404                                                                                                                                    |
| `PUT /webhook`                     | Guarda la URL de notificacion del tenant (`{"url": "..."}`)                                                                                                                                    | 200, 400                                                                                                                                    |
| `GET /webhook`                     | Consulta la URL configurada                                                                                                                                                                    | 200, 404                                                                                                                                    |
| `POST /webhook/secreto/rotar`      | Rota el secreto de firma y devuelve el nuevo (unica vez que se muestra)                                                                                                                        | 200, 404                                                                                                                                    |
| `GET /notificaciones`              | Notificaciones del tenant. Filtros: `estado` (`PENDIENTE`, `ENVIADA`, `FALLIDA`), `numeroGuia`, `limite` (1-100, def. 20), `desplazamiento`                                                    | 200, 400                                                                                                                                    |
| `GET /health`                      | Liveness + conexion a la base de datos                                                                                                                                                         | 200, 503                                                                                                                                    |
| `GET /docs` y `GET /openapi.json`  | Swagger UI y especificacion OpenAPI 3                                                                                                                                                          | 200                                                                                                                                         |

**Formato de error unico** (RFC 7807, `application/problem+json`), generado por un solo filtro:

```json
{
  "type": "urn:tracking-notifier:error:TRANSICION_INVALIDA",
  "title": "Conflicto",
  "status": 409,
  "code": "TRANSICION_INVALIDA",
  "detail": "Transicion invalida de ENTREGADA a EN_RUTA",
  "requestId": "0654ccbd-4f95-4479-bed7-ca3e6a32d9a0",
  "instance": "/guias/GUIA-1001/eventos"
}
```

Los errores de validacion agregan `errors: [{ "field": "...", "message": "..." }]`. El
`requestId` coincide con la cabecera `X-Request-Id` y con los logs.

**Webhook que recibe el cliente:** `POST` con `Content-Type: application/json`, cuerpo
`{ eventId, tenantId, numeroGuia, estado, fechaEvento, observacion }` y las cabeceras
`X-Event-Id`, `X-Notification-Id`, `X-Delivery-Attempt` (1 a 5), `X-Signature-Timestamp` y
`X-Signature`. Cualquier 2xx es exito.

**Verificar la firma (HMAC-SHA256):** `X-Signature` es `sha256=` + el HMAC hexadecimal de
`"{X-Signature-Timestamp}.{cuerpo exacto recibido}"` con el secreto del tenant. El cliente debe
comparar en tiempo constante y rechazar timestamps antiguos para evitar replays:

```js
const { createHmac, timingSafeEqual } = require('node:crypto');

function esValida(secreto, cabeceras, cuerpoCrudo) {
  const ts = cabeceras['x-signature-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const firma = createHmac('sha256', secreto).update(`${ts}.${cuerpoCrudo}`).digest('hex');
  const esperado = Buffer.from(`sha256=${firma}`);
  const recibido = Buffer.from(cabeceras['x-signature'] ?? '');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
```

## Arquitectura

```mermaid
flowchart LR
    Origen[Sistema origen] -->|POST evento| Http[Controllers HTTP]
    Http --> RE[RegistrarEvento]
    RE --> Dominio[Dominio: Guia, Notificacion]
    RE -->|una transaccion| DB[(PostgreSQL)]
    Worker[NotificacionWorker] --> DN[DespacharNotificaciones]
    DN -->|reclama SKIP LOCKED| DB
    DN --> Sender[WebhookSender]
    Sender -->|POST, timeout 5 s| Cliente[Webhook del tenant]
```

```text
src/
  domain/            Reglas puras: EstadoGuia (tabla de transiciones), Guia, EventoGuia,
                     Notificacion, PoliticaReintentos, validacion de URL. Sin dependencias.
  application/
    ports/           Interfaces: repositorios, UnitOfWork, WebhookSender, Clock, IdGenerator, AppLogger
    use-cases/       RegistrarEvento, ConsultarHistorial, ConfigurarWebhook, DespacharNotificaciones...
  infrastructure/
    http/            Controllers, DTOs, validacion, filtro de errores (problem+json), tenant
    persistence/     TypeORM: esquemas, migraciones SQL, repositorios, UnitOfWork
    webhook/         Cliente HTTP (fetch) con timeout
    worker/          Sondeo de la outbox
    config/ logging/ Variables de entorno validadas, logs JSON
  app.module.ts      Composition root: unico lugar donde se enlazan puertos y adaptadores
webhook-receiver/    Cliente de prueba para docker compose
test/                Pruebas de integracion y utilidades
```

La frontera hexagonal se verifica en `eslint.config.mjs`: `src/domain` no puede importar
frameworks, ORM ni otras capas, y `src/application` no puede importar `src/infrastructure`.

### Garantias y como se logran

| Requisito                           | Mecanismo                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin duplicar evento ni notificacion | `PRIMARY KEY (tenant_id, event_id)` en `eventos_guia` y `UNIQUE (tenant_id, event_id)` en `notificaciones`; la base de datos es el arbitro, no un `if`. Se comprueba dentro de la transaccion y despues de bloquear la guia. |
| Transiciones validas                | Tabla unica en `domain/estado-guia.ts`; `Guia.aplicar` lanza error de dominio antes de tocar nada.                                                                                                                           |
| Eventos simultaneos de una guia     | `SELECT ... FOR UPDATE` sobre la fila de la guia: se procesan en serie y el segundo ve el estado ya cambiado.                                                                                                                |
| Aislamiento por tenant              | Todo puerto de repositorio recibe `tenantId`; todas las claves lo incluyen; una guia ajena responde 404 (no revela que existe).                                                                                              |
| No perder eventos                   | Outbox transaccional (ADR-001).                                                                                                                                                                                              |
| Envio sin bloquear                  | El POST ocurre en un worker, fuera de la peticion y de cualquier transaccion.                                                                                                                                                |
| Reintentos                          | Hasta 5 intentos, espera exponencial con jitter (1 s, 2 s, 4 s, 8 s como techo), timeout de 5 s por intento. Tras el quinto fallo la notificacion queda `FALLIDA` con `ultimoError` y `ultimoStatus`.                        |
| Varias instancias                   | `FOR UPDATE SKIP LOCKED` + arrendamiento: dos workers nunca toman la misma notificacion; si uno muere, el arrendamiento expira y otro la retoma.                                                                             |

## Decisiones y supuestos

El enunciado deja varios puntos abiertos; estas son las decisiones tomadas:

1. **Identificador de la guia:** el cuerpo no lo incluye, asi que va en la ruta
   (`/guias/{numeroGuia}/eventos`). La guia se crea implicitamente con su primer evento.
2. **Maquina de estados:** el primer evento debe ser `CREADA`; `CREADA -> EN_RUTA`;
   `EN_RUTA -> ENTREGADA | DEVUELTA`; `ENTREGADA` y `DEVUELTA` son terminales. Cualquier otra
   transicion (incluida repetir el mismo estado) es un 409. Es una tabla de una linea por estado.
3. **Eventos fuera de orden:** se rechaza (409) un evento cuya `fechaEvento` es anterior a la del
   ultimo aceptado, para que "estado actual" e "historial cronologico" nunca se contradigan.
4. **Idempotencia por tenant:** la clave es `(tenantId, eventId)`. Repetir el mismo `eventId` con el
   mismo contenido responde 200 con el evento original; con contenido distinto responde 409
   (`EVENT_ID_EN_CONFLICTO`), porque indica un error del emisor.
5. **Estado 409 y no 422** para transiciones invalidas: el cuerpo es valido, el conflicto es con el
   estado actual del recurso. 400 queda para validacion de forma.
6. **Tenant sin webhook configurado:** el evento se acepta y la notificacion cuenta el intento como
   fallido (`WEBHOOK_NO_CONFIGURADO`) y se reintenta; la URL se resuelve al enviar, por lo que si el
   tenant la configura a tiempo, se entrega. Si no, termina `FALLIDA`.
7. **Orden de entrega:** no se garantiza entre eventos de una misma guia (los envios del lote son
   concurrentes y los reintentos reordenan). El payload incluye `fechaEvento` para que el cliente
   ordene; garantizarlo requeriria bloqueo por guia (ver "con mas tiempo").
8. **Entrega al menos una vez** (no "exactamente una"): el cliente debe deduplicar con `X-Event-Id`.
9. **Respuesta del webhook:** solo 2xx es exito; 3xx (no se siguen redirecciones), 4xx, 5xx, timeout y
   errores de red son fallos reintentables. El cuerpo de la respuesta nunca se lee ni se registra.
10. **Worker en el mismo proceso** que la API (`WORKER_ENABLED=false` para ejecutarlo aparte).
    Sondeo cada 1 s; si el lote viene lleno se vuelve a sondear de inmediato.
11. **`X-Tenant-Id`:** se valida solo su forma (1-64 caracteres `[A-Za-z0-9_-]`); ausente o mal
    formada es 400. La autenticacion/autorizacion es del API Gateway.
12. **Webhooks https:** en produccion solo se aceptan URLs `https` sin credenciales. `http` se habilita
    con `WEBHOOK_ALLOW_HTTP=true` (activado en `docker-compose.yml` para la demo local).
13. **`fechaEvento`:** ISO 8601 con zona horaria explicita y fecha de calendario real
    (`2026-02-30` se rechaza). Se almacena como `timestamptz` con precision de milisegundos.
14. **Secretos de firma:** el servicio genera un secreto por tenant (`whsec_...`, 256 bits) en la
    primera configuracion del webhook y lo muestra una sola vez; reconfigurar la URL lo conserva
    y `POST /webhook/secreto/rotar` lo reemplaza. Se guarda en texto plano en la base de datos
    porque el servicio necesita la clave para firmar (ver "con mas tiempo": cifrado en reposo).
15. **Credenciales en compose:** los valores por defecto (`tracking-local-dev`) son solo para
    desarrollo local, se pueden sobreescribir con variables de entorno y no hay ningun secreto real
    en el repositorio. `.env` esta ignorado por git; `.env.example` documenta las variables.

## Seguridad y logs

- **Validacion de entradas** con `class-validator` (propiedades desconocidas rechazadas, limites de
  longitud, UUID, enums, fechas), limite de cuerpo de 100 kB y consultas parametrizadas (no se
  concatena SQL).
- **Secretos y configuracion** solo por variables de entorno, validadas al arrancar (`zod`); si falta
  alguna el proceso termina con un mensaje claro. El contenedor corre como usuario no root.
- **Logs JSON estructurados (pino) sin datos personales:** los logs de peticion solo incluyen id,
  metodo, ruta (sin query string), status y latencia; nunca cabeceras ni cuerpos. Los logs de
  entrega incluyen tenant, notificacion, evento, intento, estado, status HTTP y duracion; nunca
  `observacion` (texto libre que podria contener datos personales) ni la URL del webhook. Hay pruebas
  que lo verifican.
- Los errores 500 no filtran detalles internos al cliente.

## Variables de entorno

| Variable                              | Defecto           | Descripcion                                              |
| ------------------------------------- | ----------------- | -------------------------------------------------------- |
| `DATABASE_URL`                        | (obligatoria)     | Cadena de conexion de PostgreSQL                         |
| `PORT`                                | `3000`            | Puerto HTTP                                              |
| `LOG_LEVEL`                           | `info`            | `fatal`...`trace`, `silent`                              |
| `RUN_MIGRATIONS_ON_START`             | `true`            | Aplica las migraciones al arrancar                       |
| `WORKER_ENABLED`                      | `true`            | Ejecuta el despachador de notificaciones en este proceso |
| `WORKER_POLL_INTERVAL_MS`             | `1000`            | Espera entre sondeos con la cola vacia                   |
| `WORKER_BATCH_SIZE`                   | `20`              | Notificaciones reclamadas por ciclo                      |
| `WORKER_LEASE_MS`                     | `30000`           | Tiempo que una notificacion reclamada queda reservada    |
| `WEBHOOK_TIMEOUT_MS`                  | `5000`            | Timeout por intento                                      |
| `WEBHOOK_MAX_ATTEMPTS`                | `5`               | Intentos antes de marcar `FALLIDA`                       |
| `WEBHOOK_BACKOFF_BASE_MS` / `_MAX_MS` | `1000` / `300000` | Base y techo de la espera exponencial                    |
| `WEBHOOK_ALLOW_HTTP`                  | `false`           | Permite webhooks `http://` (solo desarrollo)             |

## Pruebas: que se prueba y por que

- **Dominio (unitarias, sin framework):** la tabla de transiciones completa (cada combinacion
  permitida y _todas_ las demas rechazadas), `Guia.aplicar` (no modifica nada si falla),
  `Notificacion` y `PoliticaReintentos` (espera creciente, limite de 5), validacion de URL.
  Son las reglas de negocio: deben ser rapidas y exhaustivas.
- **Casos de uso con dobles en memoria:** `DespacharNotificaciones` (exito, reintentos sin adelantar
  el reloj, agotamiento a `FALLIDA`, webhook ausente, fallo al guardar el resultado, error
  inesperado del sender, logs sin datos personales).
- **Integracion contra PostgreSQL real:** lo que un mock no puede demostrar: 20 solicitudes
  simultaneas con el mismo `eventId` crean un evento y una notificacion; `ENTREGADA` y `DEVUELTA`
  simultaneas dejan un solo ganador; rollback completo; reclamos concurrentes que nunca devuelven la
  misma fila; arrendamiento vencido; aislamiento entre tenants; formato de error; flujo completo del
  worker contra un servidor HTTP falso (exito, 5xx, 5 fallos, timeout, registro que no espera al
  webhook, entrega tras reiniciar el servicio), firma HMAC verificable con el secreto del tenant
  (incluida la rotacion y la carrera de dos primeras configuraciones), migraciones con datos
  existentes y logs sin datos personales.

## Opcionales

| Opcional               | Estado                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Firma HMAC del cuerpo  | Hecho: `X-Signature` con secreto por tenant y rotacion                                          |
| Especificacion OpenAPI | Hecho: `/docs` y `/openapi.json` (`@nestjs/swagger`)                                            |
| Pipeline de CI         | Hecho: `.github/workflows/ci.yml` (lint, formato, tipos, pruebas y humo de `docker compose up`) |
| Metricas o trazas      | No implementado; el worker y el filtro de errores ya centralizan los puntos donde instrumentar  |

## Con mas tiempo

- Orden de entrega por guia (cola por guia con bloqueo de cabeza de linea) o numero de secuencia
  para que el cliente reordene.
- `LISTEN/NOTIFY` para despertar al worker al instante y bajar la latencia del primer envio.
- Proteccion SSRF: bloquear en el envio rangos privados, loopback y metadatos de nube (hoy solo se
  exige https y se prohiben credenciales y redirecciones).
- Reenvio manual de notificaciones `FALLIDA` (`POST /notificaciones/{id}/reenviar`) y alertas.
- Politica de retencion/archivado de `eventos_guia` y `notificaciones`; particionado por fecha.
- Rate limiting por tenant y circuit breaker por webhook para no martillar clientes caidos.
- Metricas de la cola (pendientes, antiguedad, fallidas) y trazas distribuidas.
- Cifrar en reposo los secretos de firma (KMS o cifrado de sobre) y soportar dos secretos activos
  durante la rotacion; autenticacion mutua con el gateway.
- Metricas y trazas con OpenTelemetry (no se implemento; ver "Opcionales").

## Uso de IA

Se uso **Cursor (agente en la nube con un modelo Claude de Anthropic)** como asistente de
programacion. Lo uso para: proponer el plan y la arquitectura, generar el esqueleto del proyecto,
escribir el codigo del dominio, los adaptadores, las migraciones y las pruebas, y redactar este
README y el ADR. Las decisiones de diseno (outbox transaccional, idempotencia por clave unica de
base de datos, bloqueo de fila por guia, semantica "al menos una vez") fueron revisadas y se pueden
explicar linea por linea; todo el codigo fue ejecutado y probado (suite de pruebas y
`docker compose up` con un recorrido completo por `curl`).
