# Mi Turno

De la foto de la cartelera a tu calendario personal en unos segundos.
App para Android e iOS hecha con Expo (React Native + TypeScript). Los datos se guardan en el teléfono (SQLite), sin cuenta.

## Probarla

```bash
npm install
npm run web        # vista previa en el navegador (sin cámara ni OCR local ni avisos)
npm test           # pruebas de la interpretación, el lector de tablas y el servicio de intercambio
npm run typecheck
```

## Instalarla en el teléfono

La app usa módulos nativos (OCR de ML Kit), así que necesita una compilación propia:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android   # genera un APK instalable
npx eas-cli@latest build --profile preview --platform ios       # requiere cuenta de desarrollador de Apple
```

En Expo Go funciona todo menos el OCR del teléfono (la lectura con IA sí).

## Lectura de la cartelera

| Motor | Dónde | Requisitos |
|---|---|---|
| IA de visión (Claude) | `src/recognition/claudeVision.ts` | Clave de API de Anthropic en Ajustes. La foto se envía a Anthropic. |
| OCR del teléfono (ML Kit) | `src/recognition/localOcr.ts` + `tableParser.ts` | Compilación nativa. La foto no sale del teléfono. |

En modo automático se usa la IA si hay clave y, si no o si falla, el OCR local. Ningún motor decide horarios: solo
devuelven lo leído (`BoardExtraction`), y `src/domain/interpret.ts` lo convierte en turnos con el diccionario de códigos.
Lo que no cuadra se marca para revisar; nunca se inventa un horario.

## Compartir con código de 6 cifras

Para que dos teléfonos se pasen datos hace falta un pequeño servicio en internet. El código de 6 cifras vale 10 minutos;
después los teléfonos quedan enlazados y los cambios de turnos se sincronizan solos.
Está en `relay/` y se despliega gratis en Cloudflare Workers:

```bash
cd relay
npx wrangler login
npx wrangler kv namespace create SHARES     # copia el id en wrangler.toml
npx wrangler deploy                         # devuelve la dirección https://…workers.dev
```

Pon esa dirección en `app.json` → `expo.extra.shareRelayUrl` antes de compilar (o en Ajustes → Compartir → Servicio de
intercambio en cada teléfono). Para probar en local: `node relay/dev-server.mjs` y usa `http://localhost:8787`.

Se envían turnos, diccionario y cifras de horas; nunca fotos, ajustes ni la clave de API. «Dejar de sincronizar» en
Compartir rompe el enlace.

## Estructura

```
src/domain/        lógica pura: tiempos, diccionario de códigos, interpretación, estadísticas
src/recognition/   motores de lectura y reconstrucción de la tabla
src/data/          SQLite (db.ts) y estado en memoria (store.ts)
src/services/      avisos, imágenes, copia de seguridad, compartir, clave de API
src/ui/            tema y componentes reutilizables
src/app/           pantallas (Expo Router)
relay/             servicio de intercambio para compartir con código
```

## Autor

Desarrollada por [@alebarzal](https://github.com/alebarzal).

## Licencia

MIT. Consulta [LICENSE](LICENSE).
