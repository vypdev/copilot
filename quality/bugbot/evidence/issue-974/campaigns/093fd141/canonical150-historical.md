<!-- codex:goal-950-continuation:150 -->
# Seguimiento de #950

**174/174 completos con resultado negativo: precisión88,0952% frente al90%. Ningún perfil cualificado; las42 revisiones siguen sin iniciar ni estar admitidas.** La cualificación original no se ha repetido ni relabelado. Instalación NOT_EXECUTED; producción disabled; intentos de escritura en pilotos0.

| Frente | Último estado publicado y evidencia | Trabajo pendiente |
|---|---|---|
| #974 / #997 | `de62edcbb3c1c5dc96b95d6adb53a81b63b69b1c`: CI PASS947/18789+35; revisión50/50 completada, siete hallazgos nuevos. | Correcciones operativas y documentación locales todavía sin publicar; puerta de adopción del SDD pendiente y purga alojada de GitHub pendiente. |
| #975 | UNSTARTED_NOT_ADMITTED; ningún perfil Luna→Sol cualificado. | Requiere un PASS real del174 para las mismas identidades; no se inicia por cerrar un resultado negativo. |
| #977 / #998 / #999 | `397b092fb673b489f99affdfb2c287a49439f4fe`: CI completa, Commit y Verification PASS.968 suites/19878 pruebas+35 omisiones históricas;110/110 casos mapeados; extensión385/5291/todos100%. Revisión27/27 completada con cinco observaciones nuevas. | Contrastar/corregir hallazgos antes de un merge normal justificado. Después, inventario/preview exactos.20/20UNKNOWN; canal independiente de inventario sigue siendo una decisión pendiente. Sin instalación. |
| #982 / #996 | `bbf3bf1660a4f53e194bc2eb965287c70439741a`;0/6 observaciones reales, sin entornos disponibles según el usuario. | I039/I040 Linux desktop, I041/I042 Windows desktop, X023/X026 cuenta de servicio Windows. #981/accesibilidad/VoiceOver/zoom excluidos. |

## Hallazgos y pruebas locales en curso

En #974 se reprodujo un bloqueo real cuando SIGKILL devuelve HTTP500 o pierde la respuesta: los mismos dos controles fallan sobre de62 y pasan con la corrección, incluyendo cierre de canales y retención del estado no confirmado. También se reprodujo el problema de PID1: el supervisor anterior deja20 huérfanos terminados sin recoger; el mismo trabajador inerte deja0 con el init incluido dentro de la imagen fijada. Son procesos Linux reales en contenedores de diagnóstico sin capacidades, red ni SDK/modelos. El primer ensayo tuvo un error de preparación OpenStdin=false/exit143 y queda conservado; no se cuenta como reproducción del defecto. Los53 controles modelados del supervisor y10 del vínculo bootstrap/init pasan; la composición focalizada C27 pasa44 pruebas. El primer intento de componentes conservó un caso negativo obsoleto para pid2; se corrigió solo ese fixture y la fuente productiva permaneció idéntica entre ambos intentos. Ninguno de estos resultados acredita un nuevo runtime SDK, nuevas llamadas científicas o una nueva campaña.

El init se incluye en la imagen para que sus bytes queden vinculados al digest admitido, sin inyectar otro ejecutable del daemon. El nuevo código local conserva el filtro fijo13/SHAfb324 y los permisos existentes; requiere imagen nueva y prerregistro nuevo antes de cualquier futura admisión. El resultado original sigue perteneciendo a093fd141/07f21a4/c5d0 y sus200 invocaciones SDK científicas más un control técnico separado.42 no iniciado; proveedor/modelo reportado/uso desconocidos permanecen UNKNOWN.

El canario de red original sí espera el listener y completa una conexión positiva antes de ejecutar el CLI, manteniéndolo abierto hasta después. Se está preparando la asociación pública de esos bytes con el intento original; no se modifica el recibo ni se vuelve a ejecutar. La referencia al diagnóstico personal antiguo apunta a uno de los21 blobs ya redactados: su commit y blob originales no son alcanzables desde la rama actual. La copia alojada sigue pendiente de GitHub. Se revisan los localizadores públicos innecesarios, la descripción obsoleta de historial sin cambios y la presentación del snapshot141 como archivo histórico, conservando sus bytes originales.

En #999, cinco controles adversarios nuevos reproducen dos defectos sobre397b: el parser/doctor declara válida una guía incompleta y un gitlink YAML ajeno bloquea la lectura. El control de colisión con el archivo fijo ya pasa. La corrección local exige perfil/guía/skill y excluye gitlinks ajenos conservando la colisión protegida; la validación completa está en curso. También se revisan la cobertura DNS del guard del paquete y la evidencia C23. La observación sobre64 casos se contrasta con el owner y la puerta acumulativa ya obligatoria de114; no se rebajan puertas ni se modifica a ciegas el companion seleccionado. Estos cambios aún no tienen commit/push ni nueva aceptación nativa.

GitHub Support [#5044568](https://help.github.com/ticket/personal/0/5044568) sigue Open y solo muestra la solicitud original, sin respuesta observada. No se envió un duplicado. Los hallazgos de purga alojada permanecen abiertos; no se afirma eliminación completa. Las decisiones ya solicitadas sobre adopción revisada de snapshot e inventario independiente siguen sin respuesta. No se ejecutan instalaciones, releases, activación, cambios de protecciones o privilegios.

La entrega y limpieza anteriores están conservadas en la continuación149 íntegra. El monitor de aceptación fue solo lectura y terminó al completar ambos resultados; no hubo reintentos de jobs ni escrituras en pilotos. Próximos pasos: terminar las correcciones causales, preservar originales/negativos, ejecutar los presupuestos y hooks obligatorios, auditar y publicar normalmente en las mismas ramas, y revisar el SHA final antes de merge.

<details>
<summary>Continuación149 preservada íntegramente</summary>

<!-- codex:goal-950-continuation:149 -->
# Seguimiento de #950

**174/174 completos con resultado negativo: precisión88,0952%, inferior al90%. Ningún perfil cualificado; las42 revisiones siguen sin iniciar ni estar admitidas.** La nueva entrega operativa no repite ni modifica la campaña original. Producción deshabilitada; instalación no ejecutada; intentos de escritura en pilotos0.

| Frente | Estado verificable | Pendiente |
|---|---|---|
| #974 / [#997](https://github.com/vypdev/copilot/pull/997) | `de62edcbb3c1c5dc96b95d6adb53a81b63b69b1c`: CI completa PASS,947 suites/18789 pruebas+35 omisiones históricas; Branch Sync PASS. Commit/Verification fallan porque no pueden verificar el SDD seleccionado; revisión en curso. | Decisión ya solicitada sobre una vía explícita de adopción de snapshot, y purga alojada por GitHub. Sin tercer reintento idéntico ni debilitamiento de guardas. |
| #975 | UNSTARTED_NOT_ADMITTED. El174 negativo no habilita las42; ningún perfil Luna→Sol cualificado. | Un PASS real del174 con las mismas identidades. Ninguna campaña nueva autorizada por estas correcciones operativas. |
| #977 / #998 / [#999](https://github.com/vypdev/copilot/pull/999) | Publicado `397b092fb673b489f99affdfb2c287a49439f4fe`; seis hallazgos válidos respondidos/resueltos. Hooks normales PASS968 suites/19878 pruebas+35 omisiones históricas, build/lint, cuatro bundles reproducidos idénticos. | CI/Commit/Verification y revisión del SHA nuevo; merge normal cuando esté justificado. Después, inventario/preview exactos de la revisión confiable. Inventario actual20/20UNKNOWN, sin instalación ni excepción inferida. |
| #982 / [#996](https://github.com/vypdev/copilot/pull/996) | Fuente `bbf3bf1660a4f53e194bc2eb965287c70439741a`; observaciones reales0/6. El usuario confirmó que no había entornos disponibles. | Linux desktop I039/I040, Windows desktop I041/I042 y cuenta de servicio Windows X023/X026. No se sustituyen por mocks u otro sistema. #981/accesibilidad/VoiceOver/zoom quedan fuera. |

## Entrega #999: fuente ejecutada y evidencia exigible

[Paquete Round17](https://github.com/vypdev/copilot/blob/397b092fb673b489f99affdfb2c287a49439f4fe/quality/bugbot/evidence/issue-998/review-round17/README.md). La lectura de fuente valida el manifiesto acotado y exige que main y cualquier pre/post declarado apunten al mismo bundle cuyo hash se comprueba, antes de descargarlo o insertar la caché. Reconocer formatos node20/node24 no demuestra su ejecución. Se ignoran directorios YAML ajenos sin aceptar colisiones con el archivo fijo, symlinks ni blobs no conformes. Los controles existentes C03/C102 ahora observan omisiones y lecturas/validaciones reales de credenciales; su comportamiento productivo ya era correcto. C114 hace obligatoria la aserción existente de deriva de revisión base y conserva C21 y los111 objetos anteriores exactamente, al igual que el companion seleccionado.

Los mismos cuatro controles adversarios fallan sobre la fuente anterior y pasan tras la corrección. Tres suites completas pasan292 aserciones; dos suites reforzadas pasan258. La cohorte completa de36 suites focalizadas pasa1519 aserciones,0fallos/omisiones. La política pura cambiada alcanza100% en statements/branches/functions/lines; pasan los presupuestos sin cambios de seis módulos puros y20 de runtime. El catálogo final114 IDs/110 mapeados+cuatro casos de paquete pasa110/110 contra el reporte real;31 aserciones de tooling pasan sobre los metadatos finales. La aclaración final de redacción no cambió bytes de fuente/pruebas, y tooling/mapping se volvieron a verificar.

Tres proyecciones aisladas del parser omiten, fallan o dejan pendiente la aserción de deriva base: tres falsos aceptados con la puerta anterior, tres rechazos con la corregida; el reporte original completo pasa ambas. Son controles de admisión del reporte, no ejecuciones adicionales de la funcionalidad. Se conserva el primer intento coherente1516PASS/3FAIL: la guarda rechazó evidencia duplicada y solo se corrigió el nuevo mapping. También se conserva el exit1 focalizado por pisos globales ajenos y módulos web/publicación no ejecutados; no se presenta como aceptación global/nativa.

Types, catálogo/SDD, documentación, workflows y Graphify pasan. Paquete104 archivos,11 invocaciones reales del CLI extraído con0intentos de efectos, API tipada y sesión web local pasan. Se conserva el primer arranque web fallido en el entorno restringido y el diagnóstico independiente EPERM del puerto local; el smoke con acceso local pasó con los cuatro bundles intactos. La auditoría cubre19 versiones salientes: siete coincidencias benignas de bytes ya públicos,0rutas de cuenta y0secretos pendientes, sin nuevas supresiones. La receta inicial quitó el LF antes de comparar los digests; el contraste independiente de las líneas completas con LF coincide con todas las identidades revisadas anteriormente. No se ocultó ni repitió el escaneo inicial.

Un solo push normal80bab8cd→397b092,0reintentos, sin force-push ni reescritura. Lecturas de la referencia remota y API confirmadas; la API mostró primero el SHA anterior y luego el nuevo sin repetir el push. Las seis respuestas se publicaron dentro de sus hilos existentes y se resolvieron; descripción actualizada conservando íntegra la configuración gestionada. El PASS nativo de80bab8cd es histórico: no acredita397b092. A las10:34:41Z la nueva CI había iniciado controles estáticos, build/tests estaban en cola, Commit en curso y Branch Sync había pasado; aún no hay aceptación nativa completa ni merge.

## Privacidad y aceptación #997

La rama y seis cuerpos editables están saneados. Los21 blobs históricos fueron redactados mediante la excepción exacta solicitada por el usuario; los originales científicos y el grafo original siguen preservados de forma privada. La actualización normal de243 localizadores mantiene cada byte/digest original y su recuperabilidad. El commit medido sigue siendo093fd141 y su espejo redactado82235ac es un derivado, nunca otra ejecución; [resultados científicos inalterados en el espejo](https://github.com/vypdev/copilot/blob/188ed25bdb2fea743a0d471a544f42c8f581bf4d/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md). Las200 invocaciones SDK científicas y un control técnico separado siguen siendo hechos históricos del tuple congelado; los conteos internos del proveedor, modelo reportado y uso siguen UNKNOWN.

El usuario autorizó expresamente enviar la solicitud de purga y ya fue enviada/verificada Open como [GitHub Support #5044568](https://help.github.com/ticket/personal/0/5044568), con los21 localizadores. No se duplica. La copia antigua accesible y los21 diff hunks históricos aún requieren actuación de GitHub; el hallazgo de privacidad permanece abierto y no se afirma borrado completo.

El log real de Commit de62 confirma543 rutas requeridas/22 partes de fuente y bloqueo del SDD seleccionado antes de clasificar; no es call-budget. CI947/18789+35 y presupuestos pasan; revisión aún en curso. Las dos adopciones oficiales fallidas siguen retenidas. Las decisiones de alcance sobre adopción revisada del snapshot y un canal independiente/revisado para resolver el inventario continúan sin respuesta; no se infieren excepciones ni se debilitan esas fronteras.

## Conservación y limpieza

Archivo privado `publisher-round17-and-current-native-evidence-attempt1.zip`:7510510 bytes, SHA-256 `a7d481ad3c8adbb0cd10b60b0f52b0e0089b4f50de6930d63b323db4699ba4f8`;205 rutas originales/154 miembros de bytes únicos, todos releídos y verificados. Conserva fuentes/controles causales, intentos negativos, reportes reales, mapas de cobertura, proyecciones/entradas del parser, hooks y entrega, logs nativos de62 y originales de cobertura anteriores. La respuesta/recibo final de descripción, completados después de la instantánea de archivo, se conservan aparte con equivalencia exacta. Los13 originales AST antiguos se cotejaron íntegramente contra su archivo anterior antes de retirar copias.

Retirados3779 archivos generados:114569396 bytes lógicos y122544128 asignados. Cambio de espacio libre observado113115136 bytes, medición distinta y no equiparada al espacio asignado retirado. Fuente/HEAD/estado/cambios pendientes y17stashes del checkout principal intactos; worktrees actuales protegidos. Se conserva un entorno ejecutable actual por #997/#999 para la revisión y correcciones justificadas, con condición de retirada registrada. No se regeneraron salidas para limpiar ni se tocaron dependencias activas.

`BUGBOT_VERIFICATION_MODE=disabled`. Ningún perfil cualificado,42sin iniciar, instalación NOT_EXECUTED,0intentos de escritura en pilotos. Sin releases, activación, cambios de protecciones ni privilegios.

<details>
<summary>Continuación148 preservada íntegramente, con el historial anterior</summary>

<!-- codex:goal-950-continuation:148 -->
# Seguimiento de #950

**174/174 completos y resultado negativo: precisión88,0952% frente al mínimo del90%. Ningún perfil cualificado; las42 revisiones siguen sin iniciar ni estar admitidas.** Las identidades originales medidas — fuente093fd141, prerregistro privado07f21a4 y runtime congelado — siguen describiendo la ejecución real:200 invocaciones SDK científicas y un control técnico separado. Los espejos redactados del historial son derivados y no se presentan como otra ejecución.

| Frente | Estado verificable | Pendiente |
|---|---|---|
| #974 / #997 | Publicado `de62edcbb3c1c5dc96b95d6adb53a81b63b69b1c`. A petición expresa del mantenedor se ha retirado el prefijo personal de los21 blobs históricos afectados, con copia privada exacta y lease del head anterior. Los243 localizadores ahora recuperan bytes/hash originales idénticos desde espejos alcanzables. Hooks947 suites/18.789 aserciones+35 omisiones históricas, build/lint y cuatro bundles idénticos; auditoría7 archivos sin hallazgos ni rutas personales. [Mapa, comprobaciones y límites](https://github.com/vypdev/copilot/blob/de62edcbb3c1c5dc96b95d6adb53a81b63b69b1c/quality/bugbot/evidence/issue-974/controls/history-redaction.md). | Checks/review nativos del SHA nuevo necesarios. Publicación del SDD seleccionado sigue sin reconciliar; la vía de adopción de snapshot revisada es decisión de alcance pendiente. La purga de las copias internas de GitHub sigue pendiente de soporte. |
| #975 | Luna→Sol NO CUALIFICADO;42 UNSTARTED_NOT_ADMITTED. | Sin PASS real de174 con la misma tupla no se admite la fase emparejada. Cero Sol; sin repetir para perseguir PASS. |
| #977 / #998 / #999 | Publicado `80bab8cdaecb54e3297274c51066fe4c08f21f84`. CI nativo completo, Commit, Verification y Branch Sync aprobados;968 suites/19.856 aserciones+35 omisiones históricas,107/107 casos mapeados, todos los presupuestos y extensión385/5.291/all100.111 IDs acumulativos, incluidos los25 rechazos Git obligatorios y dos controles causales de encabezados. [Evidencia y límites](https://github.com/vypdev/copilot/blob/80bab8cdaecb54e3297274c51066fe4c08f21f84/quality/bugbot/evidence/issue-998/review-round16/README.md). | Review del mismo SHA sigue avanzando en la lectura09:27UTC:23/26 particiones. No hay merge aún. Inventario default20/20UNKNOWN; decidir el canal de evidencia independiente sigue pendiente. Sin preview elegible ni instalación. |
| #982 / #996 | 0/6 observaciones reales. El usuario confirmó que no hay entornos disponibles. [Instrucciones exactas](https://github.com/vypdev/copilot/blob/bbf3bf1660a4f53e194bc2eb965287c70439741a/quality/bugbot/evidence/issue-982/README.md). | Linux desktopI039/I040, Windows desktopI041/I042 y cuenta de servicio WindowsX023/X026. #981 permanece excluida. |

La redacción histórica modifica únicamente el prefijo de cuenta en21 JSON.44 de53 commits adquieren otro SHA por contenido o parentesco, sin cambiar las demás entradas, mensajes, autores ni fechas; no había firmas invalidadas. El tip saneado7e82637 era byte a byte idéntico al tip original89db antes del seguimiento de localizadores. Una exploración aislada de1.068 blobs introducidos alcanzables y365 gzip decodificados encuentra cero prefijos personales; los21 JSON, conectividad y diff-check pasan. El primer intento de publicación se detuvo en el hook local porque la copia bare no tenía worktree; no cambió GitHub. La misma limpieza se publicó desde un worktree propio sin omitir hooks, mediante un único cambio remoto con lease exacto89db→7e826. El seguimiento de62ed es un avance normal posterior. Master/develop, tags, protecciones y privilegios permanecieron sin cambios en esa operación. Esta es la excepción concreta solicitada por el mantenedor; no una autorización general para futuras reescrituras.

Las identidades científicas originales permanecen en el bundle privado de53 commits,4.517.856bytes/SHA256e397d7f3a798a1b17a05253527bb1afe62323959c769c65b4d5308fb53383e02, con base5ebb como prerrequisito. Los21 originales también están verificados en un ZIP privado61.904bytes/SHAd081e9ad3409ea272e941dd5ffebcfceaa6fbe1616ade0187af30a66e2369252. La fuente medida original093fd141 tiene espejo público derivado82235ac53e8c9477bdc8041112e8ccb9e56d3ccc; la publicación originalf173e4c tiene espejo188ed25bdb2fea743a0d471a544f42c8f581bf4d. [Resultado negativo conservado](https://github.com/vypdev/copilot/blob/188ed25bdb2fea743a0d471a544f42c8f581bf4d/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md). No se cambia la identidad de la medición, corpus, prompts, esquema, orden, runtime, drivers ni umbrales.

También se redactaron seis cuerpos de reviews existentes, conservando el resto de cada mensaje y sus originales privados24.340bytes/SHA4141a2d969357f8a95dac4b977d18e61788a2f5e273c056210a9c80bcb9f207f. La primera guarda detectó que el bot había insertado U+200B tras @ y se detuvo antes de modificar nada; la variante se trató después comprobando la identidad exacta, sin normalización general. La eliminación alojada no está completa: una lectura sin autenticación todavía devuelve el documento original de6.075bytes con el prefijo y21 diff hunks históricos lo conservan. El espejo limpio devuelve6.065bytes sin él. El mantenedor autorizó enviar la solicitud concreta a GitHub Support; el portal confirmó su envío y el caso está abierto con las21 ubicaciones verificadas. El hallazgo permanece abierto hasta la purga alojada. No se afirma que editar la rama borre caches, referencias internas o clones ajenos.

Las cinco correcciones operativas anteriores siguen intactas: contención v2 obligatoria, fallo de recolector impide PASS, ABI s390 rechazada antes del filtro autorizado inalterado, contexto Docker real y recuperación por revisión de cada entrada. Ocho controles causales fallan antes/pasan después;85 focalizados y605 completos positivos sin fallos/omisiones/cancelaciones, con puertas AST95/90, sobre código preservado. El CI nativo del original89db aprobó947/18.789+35, presupuestos y extensión385/5.291/all100. El seguimiento de localizadores ejecuta el control existente de recuperación y verifica243/243 pares gzip/UTF8 sin cambiar ningún byte original. No se atribuye una nueva ejecución de605 ni aceptación nativa a su nuevo SHA. El fallo seleccionado-SDD del original89db está retenido en log completo; las dos solicitudes oficiales anteriores terminaron sin publicación y no hay tercer intento idéntico ni guarda debilitada.

En #999, el log original del CI de80bab8cd contiene968/19.856+35 y107/107 mapeados. El archivo completo3.358.775bytes/SHAfa06ae809de1a3127c3026f9020535f4a33a4d29e14abef992ddcdf97e790a36 y Commit53.915bytes/SHAdd616203257756db3fe7417a4b6a9e28e2fe47964c27327cd9cc8254871592ca quedan retenidos. Sus correcciones conservan los109 objetos anteriores y el companion; los75 controles del parser de informes y los dos controles causales de encabezados siguen diferenciados de las ejecuciones reales y del CI completo.

Se ha verificado un nuevo ZIP privado de controles/evidencia:329 rutas de originales,282 contenidos originales únicos,5.703.572bytes/SHAbf1ca91598e8eac9863eaa5ec885c0b8bbbec921692c2e2ba3c1d4e385aa021b. Ningún original se sustituye por un hash: las copias idénticas apuntan a su miembro exacto. Después se retiraron6.321 archivos generados — payloads de auditoría, mapas/HTML de cobertura completada, fixtures y clon temporal de limpieza — con273.276.928bytes asignados retirados. La variación separada de espacio libre fue275.386.368bytes; no se confunden ambas medidas. Fuentes, dependencias activas, originales, rollback y checkout principal con17 stashes intactos.

La continuación147 se conserva íntegra con la trazabilidad anterior de las27 issues y el archivo inmutable141. BUGBOT_VERIFICATION_MODE=disabled; perfil cualificado: ninguno; instalación: NOT_EXECUTED; pilotos:0 intentos de escritura. Sin releases, activación, cambios de protección o privilegios. La única historia reescrita es la redacción concreta solicitada y respaldada.

<details>
<summary>Continuación147 íntegra, sin modificaciones</summary>

<!-- codex:goal-950-continuation:147 -->
# Seguimiento de #950

**174/174 completos, resultado negativo: precisión 88,0952% frente al mínimo del 90%. Ningún perfil cualificado; las 42 revisiones siguen sin iniciar ni estar admitidas.** Se conservan sin cambios la fuente medida093fd141, el prerregistro07f21a4, las200 invocaciones SDK científicas y el control técnico separado. Cero Sol y cero intentos de escritura de pilotos; producción deshabilitada.

| Frente | Evidencia actual | Pendiente concreto |
|---|---|---|
| #974 / #997 | Publicado `89dbd1d293b06f6adc48ce8aa2316a9103843934`. Cinco observaciones corregidas y respondidas: contención obligatoria en v2, fallo del recolector impide PASS, rechazo temprano de ABI s390 con filtro autorizado idéntico, contexto Docker real y recuperación de cada archivo desde su revisión. Ocho controles causales fallan antes y pasan después;85 focalizados y605 completos pasan sin fallos, omisiones ni cancelaciones. Hooks947 suites/18.789 aserciones+35 omisiones históricas, build/lint y cuatro bundles idénticos. [Controles y límites](https://github.com/vypdev/copilot/blob/89dbd1d293b06f6adc48ce8aa2316a9103843934/quality/bugbot/evidence/issue-974/controls/policy-and-ledger/README.md). | CI estático/build aprobados en este SHA; cobertura y review en curso en la captura08:47UTC. Commit/Verification siguen fallando por SDD seleccionado no verificable. Sigue abierto el dato personal en21 blobs históricos; la decisión del mantenedor está pendiente. No hay reescritura ni force-push. |
| #975 | Luna→Sol NO CUALIFICADO;42 UNSTARTED_NOT_ADMITTED. | La precisión negativa impide la siguiente fase. Sin llamadas al verificador ni repetición para buscar PASS. |
| #977 / #998 / #999 | Publicado `80bab8cdaecb54e3297274c51066fe4c08f21f84`. Validación compartida de texto de encabezados y evidencia negativa obligatoria para los25 casos Git existentes.111 IDs/107 mapeados+4 de paquete; los109 objetos anteriores y el companion quedan intactos. Hooks968 suites/19.856 aserciones+35 omisiones históricas, build/lint y cuatro bundles reproducidos idénticos. [Controles causales](https://github.com/vypdev/copilot/blob/80bab8cdaecb54e3297274c51066fe4c08f21f84/quality/bugbot/evidence/issue-998/review-round16/README.md). | Dos observaciones corregidas, respondidas y resueltas. CI/Commit/Verification/review del SHA nuevo pendientes; no hay merge. Inventario default20/20UNKNOWN y decisión sobre canal de evidencia independiente pendiente; sin preview elegible ni instalación. |
| #982 / #996 | 0/6 observaciones reales; el usuario indicó que no hay entornos disponibles. [Paquete exacto](https://github.com/vypdev/copilot/blob/bbf3bf1660a4f53e194bc2eb965287c70439741a/quality/bugbot/evidence/issue-982/README.md). | Linux desktopI039/I040, Windows desktopI041/I042 y cuenta de servicio WindowsX023/X026. #981 queda excluida. |

En #997, las puertas AST de las fuentes exactas pasan: Engine95,79% sentencias/99,5% líneas/90,6% ramas/95,12% funciones; corpus99,65/100/91,97/100; implementación100/100/94,05/100. Las selecciones iniciales insuficientes y los intentos negativos de fixtures/socket permanecen conservados. La causa física de EPIPE es desconocida. El fixture positivo contiene recibos sintéticos explícitos para la validación real; no constituye evidencia de namespaces ni de los42 casos. El filtro fijo autorizado y su procedencia permanecen byte a byte sin cambios; no se ha aplicado un filtro nuevo ni ejecutado otra campaña/CLI/Docker para estas correcciones. Los35 IDs lógicos y los umbrales científicos no cambian. [Resultado científico congelado](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md).

El log completo actual de Commit, job137572285941, confirma el bloqueo por SDD seleccionado antes de clasificación, tras recopilar541 rutas/22 partes; no se atribuye a call-budget ni se reintenta manualmente. Copia decodificada original29.171bytes/SHA256c53ad5e4717e2c9a775d81b934dfdabc4b210e3a88eb31dcfc05fffe4c2d747e. Las dos solicitudes oficiales previas de adopción terminaron sin publicación; desarrollar la vía explícitamente revisada de adopción de snapshot sigue siendo una decisión de alcance pendiente. No se debilita la validación, se inventan casos científicos ni se hace un tercer intento idéntico.

El dato personal observado en el historial es el prefijo de cuenta incluido en una ruta absoluta del socket Docker. La auditoría de la historia introducida por la PR, en8a99, examinó52 commits/1.053 blobs nuevos y365 gzip decodificados:21 blobs conservan una identidad de cuenta. Los15 archivos de la nueva entrega pasan sin rutas personales. La redacción del tip no elimina los objetos anteriores; el hilo sigue abierto y no se declara corregido ni aceptado ese riesgo. Los originales privados y sus vínculos se conservan. Preparar una propuesta de eliminación no autoriza reescritura remota; las recuperaciones excepcionales anteriores ya terminaron y fueron avances normales.

En #999, dos controles idénticos de encabezados fallan sobre la fuente original y pasan tras la corrección, incluida la planificación inmutable real con hashes coincidentes. C110 vincula cada uno de16 rechazos de entradas Git malformadas y9 rutas inseguras; cada fila se prueba ausente/fallida/pendiente:75 proyecciones del informe aceptadas incorrectamente por el validador anterior y rechazadas por el corregido. El informe real sin mutaciones pasa. Son controles del parser del informe, separados de las36 suites reales/1.497 aserciones aprobadas, cero fallos/omisiones y política pura al100%. Tras el ledger final se aprobaron31 aserciones de tooling y107/107 casos mapeados. El productor inicial que esperaba26 filas en vez de25 se detuvo antes de escribir; se conserva. El exit1 focalizado por umbrales globales ajenos no es aceptación global. Tipos/lint/specs/catálogo/docs/workflows/Graphify/build y paquete104 archivos/11 CLI extraídos reales/cero efectos/API/web local pasan; los presupuestos de seis módulos puros/20 runtime también. El CI nativo completo del anterior ed475131 aprobó968 suites/19.854 aserciones y Commit/Verification, pero no acredita este nuevo SHA.

Ambas entregas se publicaron mediante un único push normal a sus refs existentes, sin force-push ni reintento del push. El retardo inicial de lectura de GitHub se conserva y la lectura posterior verifica ambos heads. Auditorías: #99715 versiones/0 hallazgos y #99916 versiones/16 coincidencias benignas de bytes completos ya publicados, cero secretos o rutas personales pendientes y sin supresiones nuevas. Checkout principal y17 stashes intactos. No hay release, instalación, activación ni cambio de privilegios. BUGBOT_VERIFICATION_MODE=disabled; perfil cualificado: ninguno; pilotos:0 intentos de escritura.

La continuación146 íntegra conserva la trazabilidad anterior, incluido el archivo inmutable141 y las27 issues. No se crean comentarios de progreso adicionales.

<details>
<summary>Continuación146 íntegra, sin modificaciones</summary>

<!-- codex:goal-950-continuation:146 -->
# Seguimiento de #950

**174/174 completos, resultado negativo: precisión 88,0952% frente al mínimo del90%. Ningún perfil cualificado;42 sin iniciar ni estar admitidas.** La fuente medida093fd141, el prerregistro07f21a4 y las200 invocaciones SDK científicas más un control técnico separado permanecen sin cambios. Cero Sol, cero intentos de escritura de pilotos y producción deshabilitada.

| Frente | Evidencia actual | Pendiente concreto |
|---|---|---|
| #974/#997 | Publicado `8a99f3bce101ed1f555aa512b21247c8b9564331`. CI nativo completo aprobado:947suites/18.789aserciones+35omisiones históricas; todos los presupuestos; extensión385archivos/5.291aserciones y100%. Los597/597 controles operativos completos y sus negativos originales se conservan. [Resultado científico](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md). | Review en curso. Commit/Verification fallan antes de clasificación porque el SDD actual no coincide con la publicación seleccionada; no se atribuye este fallo a call-budget ni se reintenta sin causa corregida. |
| #975 | Luna→Sol NO CUALIFICADO;42 UNSTARTED_NOT_ADMITTED. | La precisión negativa impide la siguiente fase. No hay llamadas al verificador ni otra campaña autorizada. |
| #977/#998/#999 | Publicado `ed47513168fac5225ac7589b8eea14b9aa65aa1e`. Equivalencia Unicode del parser compartida por mappings/perfil; navegación a registro local validado y PR conocida, sin crear estado ni inventar runs. C53, los107objetos anteriores y el companion se conservan:109IDs/105mapeados+4paquete. Hooks968suites/19.854aserciones+35omisiones históricas; cuatro bundles reproducidos idénticos. [Controles causales y límites](https://github.com/vypdev/copilot/blob/ed47513168fac5225ac7589b8eea14b9aa65aa1e/quality/bugbot/evidence/issue-998/review-round15/README.md). | CI/review del SHA nuevo en curso; no se afirma merge ni aceptación nativa nueva. Inventario default20/20UNKNOWN: sigue pendiente decidir el canal confiable de evidencia independiente. No hay preview elegible ni instalación ni solicitud de autorización para instalar. |
| #982/#996 | 0/6 observaciones reales; el usuario indicó que no hay entornos disponibles. [Instrucciones y evidencia exactas](https://github.com/vypdev/copilot/blob/bbf3bf1660a4f53e194bc2eb965287c70439741a/quality/bugbot/evidence/issue-982/README.md). | Linux desktopI039/I040, Windows desktopI041/I042 y cuenta de servicio WindowsX023/X026. No se sustituyen por otro OS, contenedor o mocks. #981 permanece excluida. |

La segunda solicitud oficial de adopción del SDD, run45122478902/job137519234768, también terminó sin publicar: una redacción sin requisitos nuevos genera cero filas y la validación obliga a un inventario no vacío. El diagnóstico cerrado señala requirement-mapping, sección4, observed0; un borrador y una reparación. El código exige asimismo casos nuevos y presupuesto positivo. Es una carencia interna de la vía de adopción, no un problema de Docker o disponibilidad del runner. Se conserva el log terminal exacto26.028bytes/SHA256f2980e991ebbe2947a28266e6f37864114b3285a590c5add61222e920717d909. La decisión sobre desarrollar una adopción de snapshot revisada explícitamente por el mantenedor sigue pendiente; no se debilita la guarda, inventan casos de cualificación ni hace un tercer intento idéntico.

En #999, los tres controles Unicode fallan antes y pasan después. Los nueve controles iniciales de navegación pasan de2PASS/7FAIL a9PASS; la ampliación detectó tres afirmaciones falsas de PR recién lista tras cancelación, corregidas con un enlace neutral. El conjunto final de168controles pasa. El conjunto focalizado completo pasa1.495aserciones/36suites,105/105mapeados y los seis módulos puros/20runtime del publicador al100%. El exit1 focalizado por umbrales globales ajenos se conserva como tal, sin llamarlo aceptación global. El primer intento restringido dio ocho EPERM TCP/UDP en loopback; el mismo conjunto pasa con loopback disponible, sin cambiar código, tests ni límites. Types/lint/specs/catálogo/docs/workflows/Graphify/build y paquete104archivos/11CLIreales/ceroefectos/API/web local pasan. Graphify informa de extracción parcial Svelte ya existente. Los dos hallazgos válidos se respondieron y resolvieron; la premisa del leaf ausente se refutó con el fixture ya existente y su prueba sin cambios. La revisión del SHA nuevo sigue siendo necesaria.

La auditoría de32versiones salientes conserva17coincidencias benignas exactamente presentes en Git publicado y ya adjudicadas: cero secretos o rutas personales pendientes y sin nuevas supresiones. Se conserva la clasificación intermedia negativa: el helper había usado un conjunto antiguo y hashes sin terminadores de línea; la adjudicación final compara bytes completos con la auditoría inmediatamente anterior, sin modificar el escáner. El checkout principal y sus17stashes permanecen intactos.

La continuación145 íntegra conserva144/143/142 y el archivo inmutable de141 con la trazabilidad de las27issues. Las recuperaciones excepcionales autorizadas ya están verificadas y no se repiten; esta entrega es un push normal. No se crean comentarios de progreso adicionales. No hay releases, instalación ni cambios de privilegios. BUGBOT_VERIFICATION_MODE=disabled; perfil cualificado: ninguno; pilotos:0 intentos de escritura.

<details>
<summary>Continuación145 íntegra, sin modificaciones</summary>

<!-- codex:goal-950-continuation:145 -->
# Seguimiento de #950

**174 casos completos y resultado negativo: precisión 88,0952% frente al mínimo del 90%. Ningún perfil cualificado; las 42 revisiones no están admitidas y siguen sin iniciar.** Se conservan sin cambios la fuente medida 093fd141, el prerregistro 07f21a4, las 200 invocaciones SDK científicas y el control técnico separado. Producción deshabilitada; cero intentos de escritura de los pilotos.

| Frente | Estado actual verificable | Pendiente |
|---|---|---|
| #974 / #997 | Publicado `8a99f3bce101ed1f555aa512b21247c8b9564331`. Correcciones operativas en 97525e17: 597/597 controles completos, cobertura AST 95/90; hooks 947 suites / 18.789 aserciones y 35 omisiones históricas, cuatro bundles idénticos. La copia pública de un log negativo elimina ocho espacios finales de cuatro líneas; el original exacto de 2.245 bytes está verificado en el ZIP privado y en Git inmutable. No se cambia la regla de CI. [Recibos y límites](https://github.com/vypdev/copilot/blob/8a99f3bce101ed1f555aa512b21247c8b9564331/quality/bugbot/evidence/issue-974/controls/pre-dispatch-cancellation/README.md). | CI/review nativos del SHA actual y reconciliación oficial de la publicación del SDD. No se infiere aceptación nativa a partir de fixtures ni se autoriza otra campaña. |
| #975 | Luna→Sol **no cualificado**. Las 42 revisiones siguen sin iniciar. | La precisión negativa impide esta fase; no hay llamadas Sol. |
| #977 / #998 / #999 | Publicado `5b3a8631af59c99e9e34f757c8efd0c2065f4357`. **CI completo nativo aprobado**: 968 suites / 19.838 aserciones y 35 omisiones históricas;103/103 casos mapeados; presupuestos aprobados; extensión 385 archivos / 5.291 aserciones y 100% en sus métricas. Commit, Verification y BranchSync aprobados. Paquete 104 archivos / 11 CLI reales con cero efectos, API y web local pasan. [Controles de la corrección](https://github.com/vypdev/copilot/blob/5b3a8631af59c99e9e34f757c8efd0c2065f4357/quality/bugbot/evidence/issue-998/review-round14/README.md). | Review nativa todavía en curso antes de evaluar el merge normal. Instalación pendiente: 20/20 workflows UNKNOWN; falta decidir el canal confiable de evidencia de inventario. No existe preview elegible ni autorización solicitada para instalar. |
| #982 / #996 | 0/6 observaciones reales; el usuario indicó que no hay entornos disponibles. [Instrucciones concretas y recogida de evidencia](https://github.com/vypdev/copilot/blob/bbf3bf1660a4f53e194bc2eb965287c70439741a/quality/bugbot/evidence/issue-982/README.md). | Linux desktop I039/I040; Windows desktop I041/I042; servicio Windows X023/X026. No se sustituyen por otros sistemas, contenedores o mocks. #981 permanece excluida. |

La primera solicitud de revisión oficial del SDD, ejecución 45119897723, falló sin publicar: esperaba cero nuevas identidades y encontró diez ya reservadas por el owner. La causa era la antigua propuesta de contención, que seguía activa en el cuerpo de la issue. Se conservaron exactamente las versiones anteriores de 63.907 y 65.132 bytes en un ZIP privado verificado (SHA-256 1871a3f24421f586cc441bf5106afc2b8cd8d64e596eb2005d68605733e1a177) y se publicó una solicitud de adopción del owner actual, sin seed activo ni casos nuevos. El contrato y las 35 identidades de cualificación permanecen en la especificación. La nueva ejecución 45122478902 requiere resultado de la Action. No se debilita la guarda de igualdad ni se reintenta Commit sin corregir la causa.

El CI estático de a696e786 rechazó los espacios finales del log original; ese negativo se conserva. La comprobación local había excluido el archivo original, por lo que no detectó esa infracción. La entrega 8a99f3bc incluye una copia derivada declarada, pasa localmente la regla estricta completa y conserva el original exacto; no añade exclusiones ni modifica código, aserciones o resultados científicos.

La observación adicional de #977 describe 20 workflows, 23 archivos de metadata y las referencias locales/externas observadas, manteniendo explícitas las ejecuciones opacas y las referencias sin resolver. No acredita ausencia semántica ni cierre transitivo completo y no modifica el clasificador: UNKNOWN se conserva. La ampliación del contrato sigue pendiente de decisión del mantenedor.

Los originales nuevos de hooks, publicaciones, review, CI negativo/positivo y fallos de SDD están retenidos en un ZIP privado verificado de 70 miembros / 2.175.351 bytes, SHA-256 c5916f916f6f183aba46277008fbd2fce9443f183c29656e40b4f56c59b2908a. Se retiraron 555 copias temporales de auditoría después de compararlas con Git publicado; 82.624.512 bytes asignados. Se conservan los informes e inventarios; la variación de espacio libre se mide por separado. El checkout principal y sus 17 stashes permanecen intactos.

[Resultado científico completo](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md). La continuación 144 íntegra conserva la 143 y el enlace a la 141 con todo el historial de las 27 issues. No se crean comentarios de progreso adicionales. No hay releases, instalación ni cambios de privilegios. BUGBOT_VERIFICATION_MODE=disabled; perfil cualificado: ninguno; pilotos: 0 intentos de escritura.

<details>
<summary>Continuación144 íntegra, sin modificaciones</summary>

<!-- codex:goal-950-continuation:144 -->
# Seguimiento de #950

**La campaña de 174 casos terminó con resultado negativo. Ningún perfil está cualificado y las 42 revisiones siguen sin iniciar ni estar admitidas.** Las correcciones operativas posteriores ya están publicadas; producción permanece deshabilitada y los pilotos registran cero intentos de escritura.

La medición conserva implementación `093fd141fd513c92d3d0eb28ba8d40805a5e8b90`, prerregistro `07f21a4cadbd1dbaf03566c57a8033f85e9ff760` y el runtime congelado. Precisión 74/84 = **88,0952%**, inferior al 90%; recall 92,5%, F1 90,2439%, ubicación 93,2432%, severidad 91,8919%, categoría 100% y Brier 0,1132083333 superan sus umbrales. Los 174 casos, sus entradas y el orden coinciden sin discrepancias; los 175 ámbitos científicos/preflight están ausentes tras lecturas frescas. Se retienen 200 invocaciones SDK científicas y un control técnico SDK separado; las peticiones internas del proveedor, modelo reportado y uso siguen desconocidos. Cero llamadas Sol. [Resultado y recibos completos](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md).

| Frente | Entrega y evidencia actual | Pendiente concreto |
|---|---|---|
| #974 / #997 | Publicado `a696e786010ecc22de41e969fc89292ed7c0a2ee`; fuente de las correcciones `97525e17d8ce6092a7195a925eeff08eed537459`. Cancelación propagada a metadata/create de Engine y cancelación del mismo signal ante fallos de registro previos al despacho. Los controles originales fallan y los corregidos pasan. Regresión completa: **597/597**, cero fallos, omisiones o cancelaciones; cobertura AST de los módulos por encima de 95/90. Hooks: 947 suites / 18.789 aserciones y 35 omisiones históricas; cuatro bundles sin cambios. [Evidencia y límites](https://github.com/vypdev/copilot/blob/a696e786010ecc22de41e969fc89292ed7c0a2ee/quality/bugbot/evidence/issue-974/controls/pre-dispatch-cancellation/README.md). | CI y review del SHA final. La discrepancia entre el SDD actual y su publicación seleccionada se ha solicitado resolver por la vía oficial de la issue, ejecución `45119897723`; aún requiere resultado de la Action. La guarda y todos los requisitos se conservan. No se reintenta Commit sin corregir la causa. |
| #975 | **42 sin iniciar y no admitidas. Luna→Sol no cualificado.** | El resultado negativo impide esta fase. Las correcciones operativas no reparan la precisión ni autorizan otra campaña. |
| #977 / #998 / #999 | Publicado `5b3a8631af59c99e9e34f757c8efd0c2065f4357`. Se rechazan encabezados obligatorios duplicados sin perder etiquetas personalizadas. Los 106 objetos anteriores y el companion se conservan; ahora 107 IDs / 103 casos Jest mapeados más cuatro de paquete. Pasan 1.422 aserciones focalizadas en 33 suites y política al 100%; hooks 968 suites / 19.838 aserciones y 35 omisiones históricas. Paquete de 104 archivos, 11 invocaciones CLI con cero efectos, API y web local pasan. [Controles causales](https://github.com/vypdev/copilot/blob/5b3a8631af59c99e9e34f757c8efd0c2065f4357/quality/bugbot/evidence/issue-998/review-round14/README.md). | Checks y review nativos del SHA final. El inventario de la rama por defecto sigue en **20/20 UNKNOWN**: falta un canal de evidencia independiente del cierre transitivo. La decisión sobre ampliar ese contrato sigue pendiente del mantenedor. Todavía no existe preview elegible ni instalación; no se ha solicitado autorización para instalar. |
| #982 / #996 | **0/6 observaciones reales**. El usuario indicó que no hay entornos disponibles; el [paquete de instrucciones y recogida de evidencia](https://github.com/vypdev/copilot/blob/bbf3bf1660a4f53e194bc2eb965287c70439741a/quality/bugbot/evidence/issue-982/README.md) está preparado. | Linux desktop I039/I040; Windows desktop I041/I042; cuenta de servicio Windows X023/X026. No se sustituyen por macOS, contenedores o mocks. #981 continúa excluida. |

En #999, el único reintento diagnóstico del SHA anterior `654ab2d5` terminó con CI completo aprobado: 968 suites / 19.836 aserciones, todos los presupuestos y 385 archivos / 5.291 aserciones de extensión. Los dos timeouts originales y sus logs permanecen; su causa física sigue desconocida. La ejecución observada incluyó tests, static y build. No se repite el diagnóstico ni se atribuye ese resultado al SHA nuevo.

En #997 se respondieron por grupos y resolvieron los 28 hilos existentes contrastados con código y evidencia. Veinte planes históricos y un diagnóstico separado tienen copias públicas sin rutas personales y descriptores explícitos; los originales exactos siguen privados y en Git histórico, sin reescribirlo. No se afirma que los controles modelados sean aceptación nativa. El control SDK y la campaña reales pertenecen a la identidad medida anterior. No se han añadido llamadas científicas.

Se retiraron 506 copias temporales de auditorías ya concluidas, después de verificarlas byte a byte contra Git publicado y sus decodificaciones gzip: 59.969.536 bytes asignados. Se conservan los inventarios, informes del escáner, adjudicaciones y originales de ejecución. El HEAD, estado y 17 stashes del checkout principal permanecen intactos.

La trazabilidad de las 27 issues y todos los resultados anteriores permanecen en la continuación 143 íntegra de abajo y en su archivo enlazado de la 141. Las recuperaciones excepcionales autorizadas de #997/#999 ya constan verificadas; las entregas actuales son pushes normales sobre las ramas existentes. #1003 sigue separado mientras se estabilizan estas entregas. No se han publicado releases, instalado el publicador ni cambiado privilegios de runners.

`BUGBOT_VERIFICATION_MODE=disabled`. Perfil cualificado: **ninguno**. Instalación: **no ejecutada**. Intentos de escritura de los pilotos: **0**.

<details>
<summary>Continuación 143 íntegra, sin modificaciones</summary>

<!-- codex:goal-950-continuation:143 -->
# Seguimiento de #950

**174 casos completos: resultado negativo. Luna→Sol NO CUALIFICADO. Las42 revisiones siguen sin iniciar ni estar admitidas.** Producción deshabilitada y cero intentos de escritura en pilotos.

La campaña mide093fd141fd513c92d3d0eb28ba8d40805a5e8b90, prerregistrado en07f21a4cadbd1dbaf03566c57a8033f85e9ff760, con el runtime y19drivers congelados. Precisión74/84=88,0952%FAIL frente a90%; recall92,5%, F190,2439%, ubicación93,2432%, severidad91,8919%, categoría100% y Brier0,1132083333PASS. Se conservan los200SDK de aplicación científicos (174iniciales+26seguimientos) y1control técnico SDK; peticiones internas del proveedor/modelo reportado/uso desconocidos. CeroSol. Auditoría174/174sin discrepancias;175ámbitos científicos/preflight ausentes tras lecturas frescas.

[Informe completo y recibos inmutables](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md). No se retoca ni repite la campaña para perseguirPASS; otra medición exige corrección causal y nuevo prerregistro. La ejecución fue local en el MacARM con contenedores Linux, no un job de GitHubActions.

| Frente | Entrega / situación actual | Pendiente concreto |
|---|---|---|
| #974/#997 | Publicado d42fc720192ac36c9e9cd9d25975e74e14d4d70a. Resultado negativo publicado en f173e4c7. Veinte planes históricos conservan originales exactos en ZIP privado verificado; copias de tip son descriptores no ejecutables sin endpoint personal. Git history permanece íntegro. Hooks947suites/18786PASS+35skips; cuatro bundles idénticos a la fuente medida. | Checks/review del SHA actual. En la ejecución45110089302, Commit falló antes de clasificación porque el SDD actual no coincide con su publicación seleccionada8d443500; seed y recibo originales sí coinciden. Ese fallo no demuestra call-budget. No se ha reintentado ni relajado la guarda. |
| #975 | 42UNSTARTED_NOT_ADMITTED; perfil Luna→Sol no cualificado. | El resultado negativo no permite esta fase. |
| #977/#998/#999 | Publicado654ab2d59178a6ee09a3b3d240d4de2bf9235f55. Campos obligatorios vacíos/cortos/excesivos rechazados; etiquetas personalizadas soportadas.106IDs/102Jest preservan los105objetos previos y el companion. Hooks968suites/19836PASS+35skips; política100%; paquete104archivos/11CLIreales0efectos/API/webPASS. Dos hilos respondidos y resueltos con corrección/refutaciónUDP probadas. | CI/review nativos del SHA actual. Inventariodefault20/20UNKNOWN: el CLI no recibe evidencia independiente de cierre transitivo. Es una carencia interna de contrato/implementación, no falta de Docker o un entorno. La ampliación del canal confiable de auditoría está pendiente de decisión de alcance del mantenedor. No hay preview elegible ni instalación ni autorización solicitada para instalar. |
| #982/#996 | 0/6 observaciones reales; usuario indicó que no hay entornos disponibles. | LinuxdesktopI039/I040, WindowsdesktopI041/I042 y servicioWindowsX023/X026. No se sustituyen por Mac, contenedor o mocks. #981 sigue excluida. |

En trabajo local no publicado, dos hallazgos adicionales de974 se están contrastando causalmente: cancelación durante metadata/creación de Engine y fallo de persistencia de observaciones previas al despacho. Se retienen cuatro negativos y controles positivos con HTTPUnix/shell controlados y la composición real del SDK. Son controles sin proveedor ni campaña; no se atribuye cualificación nativa a mocks. Ninguna de estas correcciones modifica retrospectivamente el resultado medido ni inicia42.

Las recuperaciones excepcionales autorizadas de997→a74613e9 y999→16ab6d9a se publicaron y verificaron, sinforce. Continúan preservados los merges970/983,971/984,972/988,973/986,976/989,978/987,979/991,980/992 y985/990.1003 sigue separado; no se repite su diagnóstico nativo sin corrección causal. El arreglo de empaquetado de aceptación1000/1001 está integrado en develop5ebb968; no se declara con ello que el fallo nativo actual de SDD esté resuelto.

La continuación141 y su historial de las27issues están [conservados exactamente en Git](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/canonical141.md),65495bytes/SHA256a821cf4cef12827db77605419a6541640646c60fd098f510b91c2f2856f5632f. La continuación142 íntegra se conserva abajo. Ningún comentario de progreso nuevo se crea.

BUGBOT_VERIFICATION_MODE=disabled. Perfil cualificado: ninguno. Instalación: no ejecutada. Intentos de escritura en pilotos:0.

<details>
<summary>Continuación142 íntegra, sin modificaciones</summary>

<!-- codex:goal-950-continuation:142 -->
# Seguimiento de #950

**Los 174 casos terminaron con resultado negativo. Luna→Sol no está cualificado; las 42 revisiones siguen sin iniciar.** La vía de instalación continúa en #999. Producción deshabilitada y cero intentos de escritura en pilotos.

Implementación medida `093fd141fd513c92d3d0eb28ba8d40805a5e8b90`; prerregistro privado comprometido antes de medir `07f21a4cadbd1dbaf03566c57a8033f85e9ff760`; entrega pública `f173e4c724bf21d398ec4586f2dfde0a092f482e`. [Informe completo y recibos](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md).

| Criterio | Observado | Decisión |
|---|---:|---|
| Precisión ≥90% | 74/84 = 88,0952% | FAIL |
| Recall ≥85% | 74/80 = 92,5% | PASS |
| F1 ≥87% | 90,2439% | PASS |
| Ubicación / severidad / categoría ≥80% | 93,2432% / 91,8919% / 100% | PASS |
| Brier ≤0,16 | 0,1132083333 | PASS |

Los174 casos completaron en el orden prerregistrado, con200 invocaciones SDK de aplicación (174 iniciales y26 seguimientos ordinarios), más1 control técnico SDK genuino. Las peticiones internas del proveedor, el modelo reportado y el uso siguen desconocidos. Cero llamadas Sol. No se cambian umbrales ni se repite para perseguir un aprobado: otra campaña exige corrección causal y nuevo prerregistro.

Auditoría174/174 de prompts, esquemas locales/nativos y bytes reales de artefactos: cero discrepancias. Los175 ámbitos científicos/preflight están ausentes tras GET frescos; workspaces intactos. CLI14, controles nativos4, control SDK real y591 controles de fuente pasan. Ejecución local en el Mac ARM que aloja los listeners self-hosted, con contenedores Linux temporales y el perfil fijo autorizado; **no fue un job de GitHub Actions**. No se cambiaron privilegios ni configuración persistente. Originales privados conservados en ZIP verificado de1556 entradas y Git bundle; el informe público conserva identidades y limitaciones.

| Issue | PR | Estado verificable / siguiente paso |
|---|---|---|
| #970 | #983 | Merge4736cd4; procedencia y controles preservados. |
| #971 | #984 | Mergec6590bd; auditoría EV-07 preservada. |
| #972 | #988 | Merge0ddac10; cancelación y216 controles preservados. |
| #973 | #986 | Merge25eaba3; citas de borrado y evidencia nativa preservadas. |
| #974 | #997 | 174COMPLETE_NEGATIVE publicado en f173e4c7; checks/review nativos de esta entrega pendientes. El fallo previo Commit/evidence-unavailable sigue retenido y no se declara resuelto por la campaña. |
| #975 | — | 42UNSTARTED_NOT_ADMITTED; perfil Luna→Sol NO CUALIFICADO, ninguna activación. |
| #976 | #989 | Mergee2b01db; acknowledgment recuperado. |
| #977 | dependencia#999 | No instalado. Inventario actual20/20UNKNOWN; requiere inventario completo y preview exacto sobre la rama por defecto confiable, después autorización específica de instalación. |
| #978 | #987 | Mergea7c23ad; agregado CI preservado. |
| #979 | #991 | Mergec7b7feb; política credential-health preservada. |
| #980 | #992 | Merge09d5c2d; límites de confianza de recibos preservados. |
| #981 | — | Fuera del goal por instrucción expresa; sin observaciones ni requisitos nuevos. |
| #982 | #996 | 0/6 observaciones reales: Linux desktopI039/I040, Windows desktopI041/I042 y servicio WindowsX023/X026. El usuario indicó ningún entorno disponible; no se sustituyen por Mac/contenedor/mocks. |

Seguimiento causal#985 integrado por#990 (merge5ebb968). La recuperación excepcional autorizada de#997→a74613e9 y#999→16ab6d9a ya se publicó y verificó, sin force-push. En#999, los checks de16ab pasan y la review dejó dos observaciones: el supuesto método UDP inexistente está refutado por Node24.20 y diez controles reales; el defecto de listas de campos obligatorios vacías está reproducido con dos pruebas negativas y su corrección local pasa esas dos pruebas. La nueva entrega aún requiere validación y checks/review propios. #1003 permanece independiente; no se repite su ejecución nativa sin corrección causal.

**Historial completo conservado:** [copia exacta de continuación141 y su historial anterior de las27 issues](https://github.com/vypdev/copilot/blob/f173e4c724bf21d398ec4586f2dfde0a092f482e/quality/bugbot/evidence/issue-974/campaigns/093fd141/canonical141.md),65495 bytes UTF-8, SHA-256 `a821cf4cef12827db77605419a6541640646c60fd098f510b91c2f2856f5632f`. Incluye resultados negativos, prerregistros, incidencias de retención y continuaciones previas; se conserva como archivo Git inmutable, sin recortes ni nuevos comentarios de progreso.

`BUGBOT_VERIFICATION_MODE=disabled`. Perfil cualificado: ninguno. Instalación: no ejecutada. Intentos de escritura en pilotos:0.

</details>

</details>

</details>

</details>

</details>

</details>


</details>


</details>
