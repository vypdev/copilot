## Continuidad 164 · validación local completa y auditoría del 174 original

El cambio local `223e2eb839cb9ebdd1c9f47242893ae3b5b4564a` limita a dos los archivos
simultáneos de la suite de controles, conservando los catorce originales.
Pasan 970 suites/20010 pruebas más 35 omisiones históricas y los 653 controles completos,
con 0 fallos, 0 omisiones y 0 cancelaciones en estos últimos. Tipos/lint, catálogo,
documentación y entrega/paquete pasan. La primera validación de la extensión
detectó artefactos generados desactualizados; regenerarlos resolvió esa comprobación,
conservando el fallo original. Los cuatro bundles SDK son idénticos.

**223e2eb sigue local, sin push.** [#997](https://github.com/vypdev/copilot/pull/997)
conserva el head publicado 7d6afcdb y su CI requerida fallida. Su
[revisión original](https://github.com/vypdev/copilot/actions/runs/46065082979)
sigue activa y se deja terminar antes de publicar otro head.
Las pruebas locales no sustituyen la aceptación nativa ni demuestran la causa
de los dos tiempos agotados en Linux.

Una auditoría posterior de las predicciones originales localiza los 10 FP/6 FN en
diez casos. Los seis pares FP/FN describen el mismo mecanismo de la fixture en
la misma línea que el esperado, con otra categoría. En un diagnóstico exclusivamente
en memoria, cambiar solo esa categoría permite emparejarlos; las ocho solicitudes
originales correspondientes permitían la categoría esperada en su esquema.
Los otros cuatro casos conservan premisas no demostradas; la nueva hipótesis de
symlinks en C# requiere su propia evidencia y no hereda la adjudicación anterior
sobre diferencias de mayúsculas. Ninguno de estos contrastes cambia predicciones,
etiquetas, severidades, métricas, umbrales ni el resultado original.
**174 COMPLETE_NEGATIVE; precisión 88.095238%; 42 UNSTARTED_NOT_ADMITTED.**
No se ha demostrado con esta auditoría una nueva corrección productiva que
justifique repetir la campaña.

La descripción de [#993](https://github.com/vypdev/copilot/pull/993) ya refleja
[#999 mergeada](https://github.com/vypdev/copilot/pull/999) en e0a0664,
los 20 UNKNOWN del preview real y la instalación NOT_EXECUTED. Siguen pendientes
un canal independiente acreditado y la compatibilidad de todos los productores
de la vía compartida. #982 permanece 0/6; #981 está excluida.

Sin nuevas consultas científicas/técnicas de SDK. Ningún perfil cualificado,
producción deshabilitada y 0 intentos de escritura en pilotos.

<details>
<summary>Continuidad 163 y todo el historial anterior conservados</summary>

## Continuidad 163 · #997 corregida; CI requerida bloqueada en 7d6afcdb

[PR #997](https://github.com/vypdev/copilot/pull/997) publica
`7d6afcdb4b6a143e435bbc47b7e94d500442985e`, avance normal desde c225a67 sobre
el padre revisado e0a0664. La [revisión de c225](https://github.com/vypdev/copilot/actions/runs/46045517442)
terminó sus 55 particiones con cinco observaciones y resultado neutral, no limpio.
Las cinco están contrastadas, respondidas y resueltas: dos defectos confirmados
se corrigen (limpieza previa a crear el contenedor y aserción independiente del
token de evidencia); tres sugerencias se refutan con el contrato y la fuente.
[Correcciones y controles](https://github.com/vypdev/copilot/tree/7d6afcdb4b6a143e435bbc47b7e94d500442985e/quality/bugbot/evidence/issue-974/controls/completed-c225-review).

Los controles locales del cambio pasan: 653 deterministas completos sin fallos,
omisiones ni cancelaciones; 435 AST con pisos 95/90 intactos; tres mutantes rechazados;
tipos/lint, catálogo, documentación y paquete. Los hooks ordinarios pasan 970 suites,
20010 pruebas y35 omisiones históricas. Los cuatro bundles SDK quedan idénticos.
Estos resultados locales no sustituyen la aceptación nativa.

La [CI nativa de 7d6](https://github.com/vypdev/copilot/actions/runs/46065083098)
falla en el agregado obligatorio: Static y Build/package PASS; cobertura registra
968 suites aprobadas y 2 fallidas,20008 pruebas aprobadas,2fallidas y35 omisiones históricas.
Un `git init` real agota su plazo al preparar la fuente del verificador y una
prueba agrupada de archivos inválidos excede 5s. Los originales negativos completos
están retenidos; la causa se investiga sin subir límites, omitir casos ni reintentar
sin cambio. **No hay merge mientras falle la CI requerida.**

La [revisión original de 7d6](https://github.com/vypdev/copilot/actions/runs/46065082979)
sigue activa, 10/56 particiones observadas a 21:11 UTC. No se reinicia.
[Commit/Verification](https://github.com/vypdev/copilot/actions/runs/46065070737)
falla separadamente antes de clasificar por el SDD seleccionado no verificable;
no es una puerta requerida adicional según la última lectura de protecciones.
Su adopción revisada sigue pendiente y no se fabrica evidencia para eludirla.

174 **COMPLETE_NEGATIVE**, precisión 88.095238% frente a 90%; 200 invocaciones científicas
originales y dos técnicas separadas históricas, sin nuevas consultas de cualificación.
42 **UNSTARTED_NOT_ADMITTED**; ningún perfil cualificado.
#999 sigue mergeada en e0a0664; #977 conserva 20 UNKNOWN en su preview real,
pendientes un canal independiente acreditado y compatibilidad de los productores;
instalación **NOT_EXECUTED**. #982 permanece 0/6 sin entornos reales acreditados;
#981 está excluida. La purga alojada de los 21 fragmentos históricos sigue pendiente
de evidencia completa; los cuerpos actuales están saneados.

`BUGBOT_VERIFICATION_MODE=disabled`; 0 intentos de escritura en pilotos.
Sin releases, activación, cambios de protecciones ni privilegios de runners.

<details>
<summary>Continuidad162 y todo el historial anterior conservados</summary>

## Continuidad162 · CI nativa completa PASS en c225a67

[PR #997](https://github.com/vypdev/copilot/pull/997) conserva
`c225a67475b0c3cbda09aac7e3270862ccc8c056`, integrado con el padre revisado e0a0664.
La [CI nativa](https://github.com/vypdev/copilot/actions/runs/46045517420) termina
**PASS en sus cuatro jobs**, incluido el agregado obligatorio: SDK970suites,
20010pruebas aprobadas y35omisiones históricas; extensión385suites/5291pruebas;
Static y Build/package aprobados. Los653controles deterministas completos pasan
con0fallos,0omisiones y0cancelaciones. Los originales completos están conservados
sin pérdida y verificados; no se ha reejecutado CI.

El [Review](https://github.com/vypdev/copilot/actions/runs/46045517442) sigue activo,
con55particiones previstas; todavía no hay una revisión completa.
[Commit](https://github.com/vypdev/copilot/actions/runs/46045500953) sigue bloqueado,
sin reintento, por la publicación seleccionada y verificada del SDD.
La CI aprobada no resuelve esa adopción ni equivale a aceptación completa.

El174 sigue **COMPLETE_NEGATIVE**, precisión88.095238% frente a90%;42sin iniciar
y ningún perfil cualificado. Las200invocaciones científicas originales y las dos
invocaciones técnicas separadas históricas permanecen inmutables. No hay nueva
campaña, instalación ni activación. #977 conserva20UNKNOWN y #982 sigue0/6.
`BUGBOT_VERIFICATION_MODE=disabled`;0intentos de escritura en pilotos.

<details>
<summary>Continuidad161 y todo el historial anterior conservados</summary>

## Continuidad161 · head integrado y checks actuales de #997

[PR #997](https://github.com/vypdev/copilot/pull/997) publica ahora
`c225a67475b0c3cbda09aac7e3270862ccc8c056`, con el padre revisado de #999,
`e0a0664be3d6049529cf9a20472ae9b066c94310`. El avance 470e→c225 ya está publicado.
GitHub muestra el head exacto y la rama vuelve a ser fusionable.
La composición conserva hooks970suites/20010PASS más35omisiones históricas,
11puertas de entrega, typecheck/lint y653controles deterministas completos;
435AST y sus umbrales siguen intactos. Auditoría:37versiones nuevas,
0hallazgos pendientes de secretos o rutas personales. No se repiten esas pruebas.

En la [CI nativa del head exacto](https://github.com/vypdev/copilot/actions/runs/46045517420),
Static y Build/package PASS; cobertura todavía en ejecución.
El [Review](https://github.com/vypdev/copilot/actions/runs/46045517442) sigue en curso,
con55particiones previstas; no se presenta como revisión completada.
[Commit](https://github.com/vypdev/copilot/actions/runs/46045500953) termina
FAIL/no reintentable: no puede establecer el SDD seleccionado y verificado para
esta issue/head, antes de clasificar requisitos. La recuperación del padre no
resuelve la adopción revisada del snapshot SDD; no hay un reintento sin cambio,
una publicación fabricada ni casos nuevos nominales para eludir ese contrato.

El174 conserva **COMPLETE_NEGATIVE**: precisión88.095238% frente a90%,
200invocaciones científicas originales, dos invocaciones técnicas separadas
históricas y ninguna consulta científica/técnica nueva en esta continuación.
42UNSTARTED_NOT_ADMITTED; ningún perfil cualificado.
#999 permanece mergeada normalmente; el CLI real de #977 sigue bloqueado por
20UNKNOWN,49GET y0intentos de escritura, pendiente la decisión del canal de
inventario independiente. No hay preview instalable ni instalación.
#982 sigue0/6observaciones reales, sin nuevos registros humanos ni entornos
disponibles; #981 queda excluida. Checkout principal y17stashes conservados.

`BUGBOT_VERIFICATION_MODE=disabled`;0intentos de escritura en pilotos,
instalación NOT_EXECUTED. Sin activación, releases, cambios de protecciones ni
privilegios de runners. Aceptación nativa completa y decisiones externas pendientes.

<details>
<summary>Continuidad160 y todo el historial anterior conservados</summary>

## Continuidad160 · correcciones #997 publicadas; sincronización pendiente

[PR997](https://github.com/vypdev/copilot/pull/997) publica
`470e9a7603df45ffea06f1470d7b767e640f60de` mediante dos commits ordinarios sobre
la rama existente, sin sincronizar manualmente el nuevo padre. Las cuatro
observaciones técnicas del Review626e están corregidas,
[respondidas y resueltas](https://github.com/vypdev/copilot/pull/997#discussion_r4672044867).
Los 130 localizadores originales se han retirado del índice actual; los dos hilos
sobre copias históricas siguen pendientes de la purga de Support5044568.
[Fuente y controles](https://github.com/vypdev/copilot/blob/470e9a7603df45ffea06f1470d7b767e640f60de/quality/bugbot/evidence/issue-974/controls/completed626e-review/README.md).
Hooks947/18807PASS más35omisiones históricas,653controles deterministas completos,
435AST con umbrales intactos y11puertas de entrega. Auditoría de31versiones:0hallazgos
de secretos/rutas personales. Aceptación nativa de470e todavía pendiente.

La [sincronización oficial](https://github.com/vypdev/copilot/actions/runs/45259729503)
falló antes de build en dependencies/candidate-changed; no hizo commit/push y no se
ha repetido. La composición local **c225a67**, con padre e0a0664, está validada:
970suites/20010PASS más35omisiones históricas,653/653controles sin omisiones,
11puertas,tipos/lint y37versiones nuevas auditadas sin secretos pendientes ni
rutas personales. Sigue local: su publicación requiere la excepción expresa de
recuperación de la guía. La adopción del snapshot SDD verificado sigue pendiente;
no se ha fabricado publicación ni nuevos IDs para forzarla.

**#999 sigue mergeada en e0a0664**, con CI obligatorio y sus tres jobs aprobados.
La revisión adicional terminó incompleta: checkfailure/jobcancelled,11/31particiones,
segundos después del merge. Sus originales están conservados; no cuenta como review
completa y no se ha repetido. **#977 sigue sin instalar:** preview real ejecutado
una vez contra master@ace49,49GET/0escrituras observadas, bloqueado por20UNKNOWN;
decisión independiente de inventario pendiente. Ninguna autorización de instalación
se ha solicitado sobre ese resultado bloqueado.

174COMPLETE_NEGATIVE;42UNSTARTED_NOT_ADMITTED;perfilesNONE;200invocaciones científicas
y dos técnicas separadas,sin consultas adicionales de cualificación. Pilotos0escrituras,
producción deshabilitada,plataformas0/6sin entornos,#981excluido. Support ya recibió
una única solicitud; no hay confirmación de purga. La nueva consulta del navegador
no estuvo disponible y no se presenta como una nueva comprobación del estado del caso.
Historial159 íntegro a continuación.

<details>
<summary>Historial exacto de continuidad159</summary>

## Continuidad159 · #999 integrada; instalación bloqueada por inventario

[PR999](https://github.com/vypdev/copilot/pull/999) está mergeada normalmente en
[`e0a0664be3d6049529cf9a20472ae9b066c94310`](https://github.com/vypdev/copilot/commit/e0a0664be3d6049529cf9a20472ae9b066c94310).
El árbol y los padres están verificados contra el head revisado `1dfac8d` y el
padre `5ebb968`. Sin bypass ni cambios de protección; `master` sigue en `ace49e4`.
[CI obligatorio](https://github.com/vypdev/copilot/actions/runs/45256131707) y sus
tres jobs aprobados: SDK 968 suites/19.947 tests más 35 omisiones históricas,
extensión 385 archivos/5.291 tests, 121/121 casos Jest enlazados y puerta separada
de paquete. Los 72 hilos conocidos estaban resueltos. La revisión adicional de
31 particiones seguía en curso al merge; no se presenta como completada.

[Commit y Verification de 1dfac8d](https://github.com/vypdev/copilot/actions/runs/45256116234)
aprueban; el estimador mantiene 85% y 124 requisitos para verificar/aclarar. No es
una acreditación de instalación ni de aceptación al 100%. El fallo histórico de
2748 se conserva con causa original UNKNOWN, sin repetición del job idéntico.

**#977: no instalado.** Se ejecutó una vez el CLI comprometido con `--dry-run`
contra `master@ace49e4`: resultado bloqueado, 49 GET observados y cero intentos
REST de escritura. El diagnóstico separado del lector real aísla 20/20 workflows
UNKNOWN como causa; fuente, autorización, manifiesto y guía pasan los otros
controles. La comprobación causal solo en memoria no concede autoridad y no se
usó en Apply. Sigue pendiente la decisión independiente del inventario; no hay
preview elegible ni solicitud de autorización de instalación.

**#997:** se ha [solicitado la sincronización oficial](https://github.com/vypdev/copilot/pull/997#issuecomment-7113111743)
con el nuevo padre. [Action en curso](https://github.com/vypdev/copilot/actions/runs/45259729503);
626e sigue publicado y las correcciones locales todavía esperan integración.
La Action conserva la propiedad de la sincronización. Purga histórica pendiente
de Support5044568, sin enviar otra solicitud.

174 negativos; 42 no admitidas; ningún perfil cualificado; 200 invocaciones
científicas y dos técnicas separadas, sin otras consultas de cualificación.
Pilotos evaluados: 0 escrituras. Producción deshabilitada. Plataformas 0/6 sin
entornos disponibles; #981 fuera de alcance. Historial158 íntegro a continuación.

<details>
<summary>Historial exacto de continuidad158</summary>

## Continuidad158 · corregida la última observación de #999

[PR999](https://github.com/vypdev/copilot/pull/999) publica
`1dfac8d0f735c9e6d776b15ef41e068e38cdc33d`. La revisión anterior terminó30/30
particiones con una observación válida: ocultar errores al liberar el bloqueo.
Está corregida, [respondida y resuelta](https://github.com/vypdev/copilot/pull/999#discussion_r4671337782).
La corrección comunica el fallo y conserva la PR conocida y el estado persistido;
los contenidos ajenos o dañados no autorizan borrado. [Evidencia pública](https://github.com/vypdev/copilot/blob/1dfac8d0f735c9e6d776b15ef41e068e38cdc33d/quality/bugbot/evidence/issue-998/review-round23/README.md).

Siete controles nuevos: cinco fallan antes y los siete pasan después con los
mismos tests. Cohorte36suites/1588PASS,121/121casos enlazados y cobertura100% del
almacén. Hooks normales968suites/19947PASS más35omisiones históricas; diez puertas
de entrega aprobadas. CI nativo de este nuevo SHA en curso en
[45256131707](https://github.com/vypdev/copilot/actions/runs/45256131707).
No se ha hecho merge ni instalación. El fallo histórico del Commit2748 conserva
su causaUNKNOWN; no se repitió el job idéntico.

#997 conserva626e publicado; correcciones locales todavía sin publicar. Purga
histórica pendiente de Support5044568, sin otra solicitud. Resultado174negativo,
42no admitidas, perfilesNONE,200invocaciones científicas y dos técnicas separadas
sin consultas nuevas. Pilotos evaluados0escrituras; producción deshabilitada;
plataformas0/6sin entornos y#981fuera de alcance. Se conserva íntegro157.

<details>
<summary>Historial exacto de continuidad157</summary>

## Continuidad157 · CI nativo de #999 aprobado

[PR999](https://github.com/vypdev/copilot/pull/999) mantiene el SHA
`2748a93abc951a9c0b5763249b006f943a3adfb8`. Su [CI nativo](https://github.com/vypdev/copilot/actions/runs/45243088341)
aprueba los tres jobs y el check agregado137946510665: SDK968suites/19940tests
con35omisiones históricas, extensión385archivos/5291tests, compilación/paquete y
comprobaciones estáticas. El gate ejecutado confirma120/120casos Jest enlazados;
C55–C58 conservan su puerta separada de paquete. Las tres correcciones de Round22
siguen publicadas y sus hilos respondidos/resueltos; las dos refutaciones también.

El [Commit de este SHA](https://github.com/vypdev/copilot/actions/runs/45243071766)
falló con workflow.failed durante la recopilación de comparación, antes de
clasificar requisitos. Verification refleja ese fallo; su causa original sigue
sin demostrarse y no se ha repetido el job idéntico. El CI aprobado no borra ese
resultado. La [revisión de30particiones](https://github.com/vypdev/copilot/actions/runs/45243088249)
sigue en curso. Merge e instalación todavía no ejecutados.

#997 conserva626e publicado y su revisión54completa; las correcciones locales aún
no están publicadas. Borrado alojado pendiente de Support5044568. Resultado174
negativo/42no admitidas/perfilesNONE/200invocaciones científicas y dos técnicas
separadas sin nuevas consultas; escrituras en pilotos evaluados0, producción
deshabilitada. Plataformas0/6sin entornos y#981fuera de alcance.

<details>
<summary>Historial exacto de continuidad156</summary>

## Continuidad156 · actualización con información ya publicada

[PR999](https://github.com/vypdev/copilot/pull/999) publica
`2748a93abc951a9c0b5763249b006f943a3adfb8`. Las tres observaciones válidas de la
revisión anterior están corregidas, respondidas y resueltas; las dos refutadas
también están respondidas y resueltas. [Corrección y pruebas públicas](https://github.com/vypdev/copilot/blob/2748a93abc951a9c0b5763249b006f943a3adfb8/quality/bugbot/evidence/issue-998/review-round22/README.md),
[respuestas de revisión](https://github.com/vypdev/copilot/pull/999#discussion_r4670461277).
La aceptación nativa final de este SHA sigue pendiente antes del merge normal.

[PR997](https://github.com/vypdev/copilot/pull/997) conserva626e como head publicado.
Su revisión ha terminado54/54particiones y publica nueve observaciones abiertas.
Las correcciones locales todavía no están publicadas. Las copias históricas
alojadas siguen pendientes de Support5044568; no se ha enviado otra solicitud.

**174/174 completos con resultado negativo**,42revisiones sin iniciar/no admitidas,
ningún perfil cualificado,pilotwrites0,producción deshabilitada e instalación no
ejecutada. No hay otra consulta técnica ni campaña científica. Plataformas0/6sin
entornos disponibles;#981fuera de alcance. Se conserva íntegro el historial155.

<details>
<summary>Historial exacto de continuidad155</summary>

## Continuación155 — CI de #999 aprobado; corrección local #997 validada

**174/174 completos con resultado negativo**, precisión88,095238%<90%;
42UNSTARTED_NOT_ADMITTED; perfilesNONE; piloto0escrituras; produccióndisabled;
publicadorNOT_INSTALLED. Los200SDK científicos y el canario técnico histórico
se conservan; el nuevo canario técnico protocol2 permaneceFAIL_NOT_ADMITTED.

**#999/b24d166** tiene CI CheckSUCCESS, los tres jobsCI aprobados y
Commit/VerificationSUCCESS. Prueba nativa de fuente:968suites/19935testsPASS+
35omisiones históricas; extensión385archivos/5291testsPASS. El paquete extraído
pasa11invocaciones reales del publicador con0efectos, API y sesiónweb local.
Los originales de los tres jobs quedan retenidos con sus SHA; cobertura:
3365003bytes/SHAb33a9483630ceec78eef4cd69c5482e9b3e35e810d24de8b2286ac79313ec70c.
El timeout anterior decf533 permanece registrado, con causaUNKNOWN; estePASS no
se presenta como demostración de su causa. Revisión29todavía en curso,
última observación19/29. [PR999](https://github.com/vypdev/copilot/pull/999).

**#997** mantiene626e publicado, con Review54en curso(última37/54) y la publicación
verificada del SDD pendiente. La corrección de compatibilidad ya está en el
commit **local79d64fa6fd166952de05a44f01584fd9bc094c38**. Sus hooks947suites/
18807testsPASS+35; cuatro bundles byteidénticos a626e; main y17stashes intactos.
La regresión de fuente limpia acaba de pasar **649/649,0fail/skip/cancel**,
con atestación de fuente intacta; original74395bytes,
SHAe3962b2010fd9a63d5b715658ba36422bfe123b13a37bd35bd67922038135de3.
Los65controles del módulo y su AST100líneas/99,13sentencias/95ramas/96funciones
siguen aprobados. Auditoría de las12versiones salientes:0hallazgos de secretos,
0rutas de cuenta y0supresiones nuevas. No es todavía una publicación ni CI nativo
de79d. Se adjudicará el resultado completo de Review54antes del siguiente push.

El parser corregido sigue rechazando los bytes exactos del canario real por el
nonce63/64. Una lectura temporal, sin modelo ni credenciales, confirmó además que
/bin/bash y /usr/bin/bash son el mismo binario(realpath,inode,SHA), igual que
/bin/sh y /usr/bin/sh. Su contenedor propio ya devuelve404:14IDs propios comprobados
en el conjunto técnico. No quedan copias temporales de auth.json/private-credentials
por nombre/metadatos en el staging de ese canario. No se leyeron credenciales.

### Aclaración de telemetría del canario fallido

La captura original del CLI **sí informa contadores** en turn.completed. El
UNKNOWNde154 debe distinguirse de estos datos disponibles: la identidad interna
del modelo sigueUNKNOWN; los siguientes son contadores **informados por el CLI**,
sin atribuirlos a facturación o atestación independiente del proveedor.

| Campo CLI | Valor |
| --- | ---: |
| input_tokens |25187|
| cached_input_tokens |12032|
| cache_write_input_tokens |0|
| output_tokens |636|
| reasoning_output_tokens |353|

Estos contadores pertenecen solo a la nueva invocación técnica fallida9f221/626e,
no a los200científicos ni al canario histórico. Están en el artefacto original
2832bytes/SHAbde710d723c5355342f7ffaa208315a90d0f28e22e776763b5d082f4f1eae557.
No se ejecutó otro modelo para obtenerlos. El ZIP técnico privado949058bytes,
SHA95e8d369eecdf34392f2c7856d9b2014cffbddcbd80b8ccec5406d2a9087a7b1,
verifica150rutas/107objetos originales. Prerregistros privados817dd y9f221retenidos
en bundles separados verificados con prerrequisito626e. SDK,imágenes y rollback
siguen conservados; el ZIP excluye staging de autenticación y los resultados
posteriores de79d/b24d, retenidos por separado.

### Orden de integración y pendientes externos

Las dos revisiones están ligadas a develop5ebb. El orden conserva la Review54en
curso antes de mover develop; después se comprueban de nuevo heads, protecciones
y la aceptación final de #999 para un merge normal autorizado. El previewpostmerge
ya preparado fija el merge real de #999, su árbol y masterace49; todavía no se ha
ejecutado. Inventario20/20UNKNOWN, decisión de canal independiente pendiente,
autorización específica de instalación pendiente hasta disponer de previewelegible.

Una revisión adicional de la vía ordinaria del SDD confirmó que admite enmiendas
con requisitos/casos genuinamente nuevos sobre el headactual. Los siete controles
ya descritos en el propietario79d no se convierten en casos nuevos por renombrarlos;
la decisión separada de adopción de instantánea sigue pendiente. Los rechazos
anteriores y las35identidades originales se conservan.

GitHubSupport[5044568](https://help.github.com/ticket/personal/0/5044568) se ha
consultado de nuevo: **Open,1comentario original,0respuestas observadas**, sin
confirmación de purga. No se envió otro mensaje. Los3hilos de purga siguen abiertos.
#982continúa0/6,entornos sin disponibilidad comunicada; no hay nuevas solicitudes
al usuario. #981/accesibilidad/VoiceOver/zoom quedan fuera. #1003permanece3fa4c40,
con su prueba nativa5consumida y sin reintento. No instalación,releases,activación
ni cambios de protección o privilegios de runners.

<details><summary>Continuación154 completa e inalterada — historial previo</summary>

## Continuación154 — estado actual, 23 de noviembre de2026

**174/174 completos con resultado negativo.** Precisión88,095238% frente al90%
requerido;80esperados/84observados/74aciertos,10FP/6FN. La implementación medida,
el prerregistro, el runtime, todos los intentos y los200SDK científicos permanecen
inmutables. **42UNSTARTED_NOT_ADMITTED; perfiles cualificadosNONE; escrituras de
los pilotos0; produccióndisabled; publicadorNOT_INSTALLED.** Se conservan los
27seguimientos originales. [Resultado científico y límites](https://github.com/vypdev/copilot/blob/626e4b7ee2c176d77381ecabdb0080665f3917ef/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md).

| Frente | Evidencia y resultado actuales | Puerta pendiente |
| --- | --- | --- |
| #974/#997 | Publicado626e; CI,CLI14 y nativo4PASS. Un nuevo canario técnico protocol2FAIL_NOT_ADMITTED. | Revisión54, publicación del SDD seleccionado y correcciones de compatibilidad locales. El174negativo no cambia. |
| #975 |42sin iniciar, ningún perfil admitido. | Solo un174PASS real de la misma implementación/drivers/runtime admite42. |
| #977/#998/#999 | Publicadob24d; dos hallazgos corregidos, contestados y resueltos;968suites/19935tests localesPASS+35históricos. | CI/Commit/Review del headfinal; merge normal justificado; inventario/preview confiables y autorización específica de instalación. |
| #982/#996 |0/6observaciones reales; paquetes preparados sobrebbf3bf1. | Linuxdesktop I039/I040,Windowsdesktop I041/I042,cuenta de servicioWindows X023/X026. Entornos siguen sin disponibilidad comunicada. |

### #997: fuente publicada, ejecución real y negativo preservado

Las tres contribuciones normales5327→2629515→64bc924→626e4b7 están publicadas.
El cambio captura y persiste stdout del hijoCLI antes de decodificar la respuesta
y revalida en el host la secuencia y los artefactos completos. También corrige
schema1/containment antes de importar helpers, minimiza asociaciones históricas
y aporta el mapa explícito del artefacto canónico.12hilos válidos tienen respuesta
y resolución; siguen abiertos los3dependientes de la purga alojada de GitHub.

En626e, hooks normales947suites/18807testsPASS+35omisiones históricas; regresión
completa limpia642/642,0fail/skip/cancel. CI real PASS:947suites/18807tests+35 y
385archivos/5291tests de extensión. Build/package/staticPASS; originales de los
tres jobs retenidos byte a byte. Estos checks no son pruebas nativas del runtime.
Commit/Verification fallaron antes de clasificar: falta la publicación verificada
del SDD actualmente seleccionado. No es el antiguo call-budget ni se reintentó.
La revisión54 sigue pendiente. La adopción de una instantánea ya existente sigue
siendo una decisión de alcance para una nueva capacidad de publicación; no hay
una recepción de confianza fabricada ni un guard debilitado.

La nueva imagen inmutable1f036510, fuente626e y prerregistro nativo privado817dd2
pasaronCLI14 y C32–C35(4/4,0fallos/omisiones/cancelaciones), sin modelos. Es LinuxARM
en contenedores del Mac que aloja los listeners self-hosted, **no un jobActions**.
Filtro fijo autorizadofb324e y límites de aislamiento intactos. Los12IDs propios
creados en esos pasos devolvieron404. Se retiene un error previo del recolector:
entró en fuentes históricas anidadas y rechazó82f0 antes de consultar Docker;
el recolector corregido leyó solo los cinco ledgers directos de esta ejecución.
Ninguna ejecución CLI/nativa se repitió por ese error de observación.

Después se prerregistró **un solo canario técnico protocol2** en el commit privado
9f221105; sus cuatro planes nativos son byteidénticos a817dd, cuya identidad de
ejecución original se conserva. Una nueva manifestación concreta, bajo la misma
autorización de perfil, fijó una llamada ordinaria Luna/xhigh, cero casos científicos
y ningún reintento automático. El resultado es **FAIL_NOT_ADMITTED**. El contraste
positivo abrió9/9ficheros sin leer su contenido; el artefacto del CLI registra un
único programa fijo iniciado y completado con exit0 y9/9aperturas denegadas.
El CLI emitió antes un mensaje de progreso y usó /usr/bin/bash -c, dos formas que
el controlador626e no aceptaba. Independientemente, el modelo copió63caracteres
del nonce de64del programa: la igualdad final también falla. Artefacto CLI original
2832bytes,SHA256bde710d723c5355342f7ffaa208315a90d0f28e22e776763b5d082f4f1eae557,
retenido privado. El contenedor propio del canario también devuelve404.

Se distinguen **200invocacionesSDK científicas,1canario técnico histórico y1nuevo
canario técnico fallido**. Modelo interno/uso informado por el proveedorUNKNOWN.
Las9denegaciones independientes observadas son hechos parciales; no convierten
el canario completo enPASS, no recalifican093fd141 y no admiten42.

La corrección **todavía local** retiene el progreso previo/durante el comando sin
darle autoridad y añade únicamente las formas fijas no-login /usr/bin/bash y
/usr/bin/sh. Sigue exigiendo un comando real completo y un JSONfinal separado,
con nonce exacto. Los mismos7controles nuevos dan2PASS/5FAIL en626e y65/65componentes
PASS tras corregir; se conserva el intermedio63PASS/2EPERM de sockets locales.
CoberturaAST100líneas/99,13sentencias/95ramas/96funciones, con pisos95/90 intactos.
La validaciónoffline de los bytes originales confirma que el parser corregido
**sigue rechazando el nonce erróneo real**. Hay3SDDs,docs,catálogo y paquete de
trazabilidad actualizados localmente; faltan hooks/regresión limpia y la revisión
final antes de publicar. No se ejecuta otro modelo para buscar un aprobado.

### #999: segunda corrección de perfiles publicada

Head[b24d16670792e487a4867ee74c321ddcefef911d](https://github.com/vypdev/copilot/pull/999).
C122exige el prefijo ordenado de etiquetas de routing dentro de formLabels,
conservando prioridad configurable y duplicados generados. C123exige ramas
gestionadas para hotfix/release con formularios habilitados o deshabilitados;
los perfiles manuales feature/bugfix/docs/chore/help siguen válidos.
La revisión anterior completó29/29particiones con estos dos hallazgos, ambos
reproducidos antes de corregir y contestados/resueltos tras el push.

Preservados los121objetos previos y el compañero seleccionado64. Ledger actual
**123IDs=119Jest+4paquete**, diez controles incrementales. Cohorte36suites/1576PASS,
0fallos/omisiones y119/119mapeados; política100% en las4métricas; presupuestos
6pure/20runtime,tipos/lintPASS. Se conservan ambos pares causales y las negativas
locales de sockets. Nueve puertas de entrega pasaron; solo el smoke de paquete
que no abrió su sesión web bajo el sandbox se ejecutó después con sockets
permitidos y exactamente los mismos inputs.11invocaciones reales del CLI
extraído,0efectos; web/API/packagePASS. Hooks968/19935+35; bundles estables,
checkoutprincipal y17stashes intactos. Auditoría15versiones/16coincidencias
benignas exactas ya publicadas,0secretos pendientes/0rutas de cuenta/0supresiones.
Un solo push normal, sin force ni reescritura, verificado por Git y API.
[Evidencia publicada](https://github.com/vypdev/copilot/blob/b24d16670792e487a4867ee74c321ddcefef911d/quality/bugbot/evidence/issue-998/review-round21/README.md).

El padre cf533 conserva su fallo nativo:19924PASS/1FAIL+35, un timeout de5000ms
en recuperación de journal; causaUNKNOWN. La suite afectada ahora instala el
observadorI/O acotado existente, sin cambiar timeout,reintento,skip,aserciones ni
finalización. No registra argumentos,rutas,contenido,credenciales o entorno.
No se afirma una corrección causal del timeout. El nuevo job deriva de dos
cambios reales de fuente; no se repite el job anterior. Enb24d,Build yStaticPASS;
coverage,Commit yReview29 siguen pendientes en esta observación. No se ha hecho
merge con aceptación pendiente.

### Instalación, plataformas y retención

La autorización de merge normal sigue vigente cuando esté justificado, con
protecciones y SHAfinal verificados. Después el previewCLI debe fijar la revisión
realmente merged por un mantenedor y su árbol, no presentar el headcontribuidor
como SourcePin. Develop5ebb968 y defaultmasterace49e4 siguen separados de una
instalación. Inventario previo20/20UNKNOWN; se mantiene la decisión pendiente sobre
evidencia independiente. Preview preparado no equivale a instalación; autorización
específica solo con un resultado elegible y revisable. No hay instalación ni
canario del publicador ejecutados.

#1003sigue en3fa4c40: checks/reviewPASS, prueba nativa5ya consumida8PASS/2FAIL,
10estados/20canales y limpieza completa; uid_map y RTM_NEWADDR siguen sin admitir.
No se reintenta ni se presenta como ausencia global de Docker. Se conserva su
base mientras termina #999.

#982mantiene0/6. La lectura de sus cuatro comentarios no aporta nuevas observaciones
humanas o entornos. No se vuelven a pedir al usuario; Linuxcontenedor y macOS no
sustituyen Linuxdesktop/Windows/cuenta de servicio. #981,accesibilidad,VoiceOver
y zoom siguen fuera de este goal.

GitHubSupport[5044568](https://help.github.com/ticket/personal/0/5044568) **ya enviado**;
última observaciónOpen. Las autorizaciones repetidas no generan más solicitudes.
La rama y los textos editables están saneados; la copia histórica alojada y los
21fragmentos dependen de GitHub. No se afirma purga completada.

R21está retenido en un bundle incremental verificado13995bytes/prerrequisitocf533,
SHA7b855f948076d4a850cc96205dbb5041266e3d81485b6dfaae9c58e0b4eb05ae,
y ZIP privado10000293bytes,SHA529261f2e930e63584e2588166e5fd9faaec7e0fbd137dafa6c3a76bcd8582bc,
144rutas/126objetos originales verificados. El ZIP no incluye resultados nativos
futuros deb24d ni el nuevo canario626e. Se retiraron únicamente4907archivos
generados de cobertura/auditoría:157349530bytes lógicos/167661568asignados,
tras comprobar JSONcontraarchivo y15payloads contraGit. Fuentes,SDK,recibos,
rollback y checkoutprincipal preservados. Los archivos científicos e históricos
previos y el archivo exacto de continuación153 siguen retenidos.

<details><summary>Continuación153 completa e inalterada — historial previo</summary>

<!-- codex:goal-950-continuation:153 -->
# Seguimiento de #950

**174/174 completos con resultado negativo: precisión88,095238%, inferior al90%. Ningún perfil cualificado;42 UNSTARTED_NOT_ADMITTED.** Se conserva la campaña original sin repetirla ni relabelarla. Producción disabled, instalación NOT_EXECUTED e intentos de escritura en pilotos0.

| Frente | Estado verificable | Pendiente |
|---|---|---|
| #974 / [#997](https://github.com/vypdev/copilot/pull/997) | Publicado5327; commit local2629 y nuevas correcciones en curso. CLI14 y SDK4 reales de5327 conservados. Revisión52 completa; se reprodujeron y corrigieron localmente dos fallos de evidencia del control genuino, además de la importación prematura del helper. | Terminar validaciones, commit normal y regresión sobre fuente commitada, auditoría y publicación de la corrección. Nueva captura aún sin ejecución real con modelo; adopción SDD y purga alojada pendientes. |
| #975 | NO CUALIFICADO;42 sin iniciar ni admitir. | Solo174PASS real sobre el mismo tuple admite42. No se inicia otra campaña para perseguir un aprobado. |
| #977 / #998 / [#999](https://github.com/vypdev/copilot/pull/999) | Publicado `cf5336ffcbdc66fc2af69ce90b02119836ae071a`. Cinco hallazgos de8026 corregidos/respondidos. Hooks completos968/19925+35;117/117mapeados. Build/Package y Static nativos PASS, cobertura nativa negativa por un timeout. | Terminar revisión29 y Commit/Verification; investigar el negativo sin subir límites ni rerun idéntico. No merge ni instalación. Después, inventario/preview exactos; último20/20UNKNOWN. |
| #982 / [#996](https://github.com/vypdev/copilot/pull/996) | Fuente bbf3bf16; observaciones reales0/6. Usuario sin entornos disponibles. | I039/I040 Linux desktop, I041/I042 Windows desktop, X023/X026 cuenta de servicio Windows. #981/accesibilidad/VoiceOver/zoom excluidos. |

## #999: Round20 publicado y negativo nativo conservado

[Fuente y controles Round20](https://github.com/vypdev/copilot/blob/cf5336ffcbdc66fc2af69ce90b02119836ae071a/quality/bugbot/evidence/issue-998/review-round20/README.md). El generador realmente construye arrays de tamaño fijo sin deduplicación. El perfil exige esos tamaños y restringe workflow a los kinds soportados, preservando valores configurados. C34 prueba schema futuro en carga/resume; C114 añade el refSHA real del proveedor a la composición reader/planner conservando su evidencia original. C120/C121 añaden las nuevas obligaciones:121IDs/117Jest+4paquete; los otros118 objetos y el companion64 siguen exactos.

Antes de crear una PR ausente se inspeccionan también los marcadores abiertos de la operación en cualquier rama, con las peticiones restantes del MISMO máximo de10consultas/100filas. Datos incompletos, malformados, repetidos, conflictivos, cancelación o snapshot obsoleto bloquean POST. La recuperación exacta sigue head-scoped, state=all y sin filtro de base; conserva identidad/commit/base/repositorio/estado/duplicidad. C89 modela ahora el filtro real del proveedor. Sin search-index absence ni UNKNOWN override.

Original controlado2PASS/16FAIL; los mismos cuerpos causales pasan corregidos y la suite completa de cuatro archivos223PASS. Dos negativos intermedios de fixture/tipos se conservan; no se afirma identidad completa de sus fixtures. Cohorte36/1566/0fallos/0omisiones y117/117mapeados; guía100% y presupuestos existentes6puros/20runtime PASS. Types/lint,10gates de entrega, paquete104archivos y11CLI extraídos reales con0efectos PASS. El exit1 focalizado de pisos globales ajenos no ejecutados se conserva. Hooks normales968suites/19925tests+35omisiones históricas; bundles reproducidos iguales. Auditoría19versiones con16 coincidencias benignas exactas ya publicadas,0secretos pendientes/0rutas personales/0supresiones nuevas.

Un push NORMAL8026→cf533,0reintentos/0force/0reescrituras, ref y API confirmadas. Cinco respuestas en hilos existentes y cinco resoluciones; descripción actualizada conservando la configuración exacta. Checkout principal y17stashes intactos. El permiso de merge normal sigue vigente, pero este SHA no está aceptado por CI.

Run45208531201/job137810755853:967suitesPASS/1FAIL,19924PASS/1FAIL+35. La única prueba que falla es la recuperación pre-POST base-commit-read con journal real: exceeded timeout5000ms. No hay evidencia suficiente para atribuir su causa al nuevo escaneo o a una causa común de streams. Original3191887bytes/SHA256 `ed35334b546ffb92949bc288614731a90c4a2561bff20640ce74121f4b3e00cd` retenido, sin nuevo dispatch ni rerun. Build/Package y Static PASS; revisión29/Commit en curso a la última lectura. El resultado de8026 era positivo y no se atribuye a cf533.

## #997: interpretación histórica corregida y fuente operativa en curso

La revisión52 de5327 terminó. El control histórico genuino conserva su invocación y bytes; el nonce retenido acredita acceso al workspace. Las nueve denegaciones venían en texto del modelo y faltaba una observación independiente de los nueve intentos del programa. Esa limitación no cambia las métricas ni convierte el174 negativo en otro resultado.

Dos controles nuevos producen0PASS/2FAIL en el código original: acepta JSON del modelo sin captura del comando y acepta un ledger interior de solo PASS. Los mismos cuerpos pasan tras la corrección. El protocolo privado2 vincula captura al plan/signal/ámbito vivo, selecciona JSON del CLI solo en ese control, guarda el stdout real antes de decodificar texto del modelo y exige inicio/completado/exit0 del comando fijo con nonce y nueve denegaciones. El host revalida procedencia, secuencia completa y bytes de request/response/captura. Salidas inválidas/duplicadas se conservan antes del rechazo. No es tracing de syscalls ni una aprobación serializada. No hay nueva ejecución genuina ni científica y no se reutiliza el plan anterior.

Controles del controlador actual58PASS; cobertura AST fuente exacta:100%líneas/99,12%sentencias/94,73%ramas/96%funciones. SDK ampliado7suites/200PASS/24omisiones de plataforma,0fallos; control de ámbito100% y los módulos modificados superan95/90. El primer conjunto de cobertura incompleto y el ENOENT de instrumentación se conservan. La regresión completa previa al commit da616PASS/23FAIL sobre639: los23 fallan porque la fuente modificada no coincide con HEAD, antes de su escenario. Se repetirá sobre la fuente commitada sin relajar attestation; no es aceptación global. Types/lint/documentación/catálogo/build pendientes de cierre.

El bootstrap schema1+containment ya rechaza el helper no admitido antes de importarlo (negativo causal0/1→1/1). La política real de identidades en Node24.20 rechaza24 terminadores finales adversarios y conserva2baselines válidos: se refuta la sugerencia de regex sin cambiar esa política. C32/C33 cancelan en el controlador al recibir ready antes de esperar el proceso completo; su fuente y los4PASS nativos5327 no requieren un replay.

Se retiraron asociaciones públicas innecesarias de20descriptores históricos; los originales exactos se retienen privados. Se recuperaron y verificaron realmente114gz mediante los locators saneados. Result/resultados, recibo SDK y archivos históricos141/150 permanecen byte-exactos. Un mapa actual resuelve la ruta original canonical141 del recibo al archivo histórico65495/SHAa821cf4c sin reescribirlo. No se ha reescrito otra vez la historia ni se ha verificado purga alojada.

## Conservación y pendientes

Archivo `publisher-round20-source-and-parent-native-originals-attempt1.zip`:3560370bytes/SHA256 `1d9df0830cc94960ccfe609eeb7b49f1db83086ab3ea484f755b6cf3f199e983`,118rutas/115objetos únicos, todos releídos y verificados. Preserva fuente causal/negativos/cohorte/hooks/auditoría/push/respuestas y originales nativos de8026, más canonical152 exacto. Bundle cf53317762bytes/SHA `78493bc7a5fe3ca872ef8fe2fcdeb949c92d05417f5a6a6b671b907f3aa0b88c`, prerequisito8026, verificado. El negativo nativo cf533 posterior y los cambios997 siguen retenidos aparte. Limpieza de esta iteración pendiente de sus consumidores activos.

Solicitud ya enviada y verificada como [GitHub Support5044568](https://help.github.com/ticket/personal/0/5044568), sin duplicados. Última lectura observó Open y solo la solicitud original; no se inventa respuesta posterior ni eliminación completa. Los tres hilos de purga alojada siguen abiertos. Adopción revisada del SDD y evidencia independiente del inventario siguen pendientes. No se repiten preguntas sobre entornos ni se fabrican aprobaciones. #1003 conserva Native5 ya ejecutado8PASS/2FAIL y streams Node NOT_MEASURED; sin nuevo dispatch.

`BUGBOT_VERIFICATION_MODE=disabled`; perfiles cualificados NONE;42sin iniciar; instalación NOT_EXECUTED;0intentos de escritura en pilotos. Sin releases, activación, cambios de protecciones o privilegios.

<details>
<summary>Continuación152 preservada íntegramente, con151 y el archivo150 que conserva todo el historial anterior</summary>

<!-- codex:goal-950-continuation:152 -->
# Seguimiento de #950

**174/174 completos y resultado negativo: precisión88,095238%, inferior al90%. Ningún perfil cualificado;42 UNSTARTED_NOT_ADMITTED.** El resultado original no se repite ni se relabela. Producción disabled, instalación NOT_EXECUTED e intentos de escritura en pilotos0.

| Frente | Estado verificable | Pendiente |
|---|---|---|
| #974 / [#997](https://github.com/vypdev/copilot/pull/997) | Publicado `5327d533045ab10dff1ca6969317c12e93b88cf8`. CLI14/14 y SDK C32–C35 4/4 técnicos PASS en tuple5327/private4c23/image6d196,0modelos; la CI nativa de5327 es negativa. Corrección local del fixture C15 en `2629515a3b16e141fb7bfdcf6d3fd47dc7c0abcc`, ya validada y auditada. | Dejar terminar la revisión52 de5327, contrastar hallazgos válidos y publicar normalmente2629. Adopción revisada del SDD seleccionado y purga alojada pendientes. |
| #975 | Luna→Sol NO CUALIFICADO;42 sin iniciar ni admitir. | Solo un174PASS real con las mismas identidades admite42. No se inicia una campaña para perseguir un aprobado. |
| #977 / #998 / [#999](https://github.com/vypdev/copilot/pull/999) | Publicado `8026c8005e15e7890c5b7c64ffe121da588eb7fa`: CI completa, Commit y Verification PASS.968 suites/19898 pruebas+35 omisiones históricas;115/115 controles mapeados. | Revisión28 en curso antes de merge normal justificado. Después, inventario/preview exactos sobre master confiable. Último inventario20/20UNKNOWN; decisión sobre evidencia independiente pendiente. Sin instalación. |
| #982 / [#996](https://github.com/vypdev/copilot/pull/996) | Fuente `bbf3bf1660a4f53e194bc2eb965287c70439741a`; observaciones reales0/6. Sin entornos disponibles según el usuario. | I039/I040 Linux desktop, I041/I042 Windows desktop, X023/X026 cuenta de servicio Windows. #981/accesibilidad/VoiceOver/zoom excluidos. |

## Fuente #999 publicada y aceptada por CI

[Round19, fuente y evidencia](https://github.com/vypdev/copilot/blob/8026c8005e15e7890c5b7c64ffe121da588eb7fa/quality/bugbot/evidence/issue-998/review-round19/README.md). La recuperación consulta todos los estados por owner:rama exacta, sin filtro de base. Más de1000 PRs ajenas no desplazan la propuesta. Se conservan100/página,10páginas, rechazo de respuesta interminada y controles de marcador/head/commit/repositorio/base/estado/duplicidad. C44 observa la consulta acotada; C119 exige recuperación exacta y rechazo de duplicado/base ajena/repositorio ajeno. Los118 objetos anteriores y el companion seleccionado64 siguen idénticos. El catálogo acumulativo exige119 IDs/115mapeados+cuatro casos de paquete.

Cuatro cuerpos idénticos fallan sobre4806 y pasan corregidos; la suite completa pasa87. La cohorte36/1539/0fallos/0omisiones pasa115/115mapeados. Pasan types/lint, presupuestos existentes6puros/20runtime, catálogo/SDD/docs/workflows/Graphify/build/paquete104archivos y11 invocaciones reales del CLI extraído con0efectos. El exit1 focalizado por pisos globales ajenos no ejecutados permanece conservado. Hooks normales968/19898+35; cuatro bundles reproducidos iguales. Auditoría13versiones: siete coincidencias benignas previamente contrastadas,0secretos pendientes/0rutas personales/0supresiones nuevas.

Un push normal4806→8026,0reintentos, sin force-push ni reescritura; referencia y API verificadas. Respuesta dentro del hilo existente y resolución del hallazgo; descripción actualizada manteniendo la configuración gestionada. CI nativa del SHA8026 pasa968 suites/19898aserciones+35 y115/115mapeados; Build/Package, Commit y Verification PASS. Los bytes originales del log de cobertura son3365269/SHA256 `d90f7effeaed5de74d7c5ff998b216844445ac42516bd06a85f5888973f3239b`, y el log de Commit54432/SHA `ad3fae035200f671b62b709d4cb4e1183b24fa2a4df9c6b4b77bf9f110e594ee`. Revisión28 aún en curso, último progreso observado14/28. No hay merge ni instalación en esta continuación.

La receta posterior al merge ya está preparada: usará el commit mergeado real con árbol idéntico al head revisado, el SHA real de master y hashes exactos, ejecutando el CLI en dry-run. Su guard de transporte rechaza escrituras. Cinco controles modelados del guard deniegan cinco métodos con0llamadas al transporte original/0peticiones reales; no son ejecución de instalación. La receta real sigue sin ejecutar, no concede autoridad y no cambia UNKNOWN en una aprobación.

## #997: fixture corregido, campaña inalterada

El fixture C15 terminaba sin leer stdin. La aserción reforzada de captura produce2PASS/1FAIL; el ejecutable corregido espera EOF y la misma suite completa pasa30/30. Se conservan las ramas negativas sin dispatch/captura cuando falla la persistencia. Código productivo SDK/drivers, timers e IDs lógicos permanecen idénticos. La fuente Windows se adapta, sin atribuirle una nueva observación nativa Windows. No se ha demostrado que este defecto explique todos los fallos de5327 ni el error nativo concreto de escritura del prompt; benchmark/PAT/Octokit y JSON circular siguen con causas UNKNOWN.

El commit local2629 pasa hooks normales947suites/18789pruebas+35 omisiones y11validaciones de entrega; cuatro bundles idénticos a5327. Auditoría13versiones,0hallazgos/0rutas personales/0supresiones. Está listo para publicación normal, conservando antes la revisión52 en curso de5327 (último progreso observado50/52). No se reejecuta un job idéntico ni se aumenta un límite.

Los controles técnicos reales posteriores al reaper pertenecen a5327/private `4c23a52264dd36fe975464ef5773ac5c5ff3ceb8`/imagen `sha256:6d196f4007103963549144b15aff1e1e6735450e2c85d04fb201b04980ab7106`: CLI14 y SDK4PASS,12 IDs propios recién404, mismo filtro13/SHAfb324 y permisos. Fue host Mac ARM/contenedores Linux, no un job de Actions.0modelos científicos o técnicos nuevos; no acredita un nuevo control genuino con modelo. Originales íntegros en el commit2629 local aún sin publicar y en el archivo privado, asociados a la fuente realmente ejecutada5327.

La campaña original sigue en093fd141/private07f21a4/imagenc5d0:174iniciales+26seguimientos=200invocaciones SDK científicas y un control técnico genuino separado.80esperados/84observados/74emparejados;10FP/6FN. Precisión88,095238%FAIL; recall92,5%,F190,243902%,ubicación93,243243%,severidad91,891892%,categoría100%,Brier0,11320833PASS.0discrepancias de bytes/orden/prompt/esquema y175scopes originales ausentes. Conteos internos/modelo reportado/uso UNKNOWN. [Resultados originales en espejo redactado](https://github.com/vypdev/copilot/blob/188ed25bdb2fea743a0d471a544f42c8f581bf4d/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md).42inadmisible; ningún perfil cualificado.

## Conservación y pendientes externos

Archivo privado `reaper-native-and-publisher-round18-original-evidence-attempt1.zip`:4793820bytes/SHA256 `77f434b31e8e0c800685ea03d62dfcd712901ef8ba9fe75d81eb863091b06f2f`,404rutas/342objetos únicos; archivo `publisher-round19-and-fixture2629-source-evidence-attempt1.zip`:3052689bytes/SHA `876a773400146b42ef1016eeacc1a2adf4cf2147586a6a5d3dd44a5e9d966acb`,123rutas/116objetos. Todos los miembros releídos y verificados. Preservan negativos, entradas reales, logs, mapas/controles causales y entregas; los logs nativos8026 posteriores quedan retenidos aparte. Bundles5327/4806/private4c23 y deltas8026/2629 verificados.

Retirados77849archivos generados,1335437667bytes lógicos y1530757120asignados. Las dos mediciones de cambio libre son1460494336y106250240bytes y no se equiparan al espacio asignado retirado. Se retiró únicamente la imagen diagnóstica propiaf496, sin prune/force; la imagen actual6d sigue disponible y el espacio del Engine no se midió. Quedan el SDK actual y el original científico con hashes de fuente distintos para diagnóstico, más entornos actuales de las PRs mientras los consume la revisión. HEAD/estado/cambios y17stashes del checkout principal intactos.

La descripción de [#1003](https://github.com/vypdev/copilot/pull/1003) ya reconcilia la ejecución existente Native5:run45066614197/job137344089146/ubuntu-runner-4,8PASS/2FAIL,10estados/20canales y limpieza completa. Sin nuevo dispatch. Unshareuid_map y CodexPATHvacío fallanEPERM; socket fijo ausente solo en ese job. Compatibilidad de streamsNode NOT_MEASURED; no admisión SDK/modelo ni explicación causal de otra CI. Native4 conserva su causa Engine UNKNOWN.

La solicitud autorizada ya está enviada como [GitHub Support5044568](https://help.github.com/ticket/personal/0/5044568), sin duplicados. Última lectura observó Open y solo nuestra solicitud original; no se atribuye una respuesta posterior no observada. La rama y seis textos editables están saneados; copias alojadas/21fragmentos requieren actuación de GitHub. Tres hilos de purga siguen abiertos. La decisión de adopción revisada del SDD y la de evidencia independiente del inventario continúan pendientes, sin repetir preguntas ni inventar excepciones.

`BUGBOT_VERIFICATION_MODE=disabled`; perfiles cualificados NONE;42sin iniciar; instalación NOT_EXECUTED;0intentos de escritura en pilotos. Sin releases, activación, cambios de protecciones o privilegios.

<details>
<summary>Continuación151 preservada íntegramente, con enlace al archivo150 y todo el historial anterior</summary>

<!-- codex:goal-950-continuation:151 -->
# Seguimiento de #950

**174/174 completos con resultado negativo: precisión 88,095238% frente al mínimo del 90%. Ningún perfil cualificado; las 42 revisiones siguen sin iniciar ni estar admitidas.** Instalación NOT_EXECUTED, producción disabled e intentos de escritura en pilotos 0.

| Frente | Estado y evidencia | Pendiente |
|---|---|---|
| #974 / [#997](https://github.com/vypdev/copilot/pull/997) | Publicado `5327d533045ab10dff1ca6969317c12e93b88cf8`. Corrección de SIGKILL fallido e init incluido en imagen; hooks 947 suites/18789 pruebas +35 omisiones históricas. Nueva composición técnica CLI14/14 y SDK4/4 PASS, sin modelos. | CI nativa de5327 negativa; fixture de stdin corregido localmente con contraste causal. Resto de causas aún UNKNOWN. Revisión52 particiones en curso, puerta del SDD seleccionado y purga alojada pendientes. |
| #975 | UNSTARTED_NOT_ADMITTED; Luna→Sol NO CUALIFICADO. | Requiere PASS real del174 con las mismas identidades. El resultado negativo y las correcciones operativas no autorizan42 ni otra campaña. |
| #977 / #998 / [#999](https://github.com/vypdev/copilot/pull/999) | Publicado `4806e074dc31712a8ce9c2c9695805a3e56b7423`: CI/Commit/Verification PASS, revisión28/28 completa;968 suites/19894 pruebas+35 omisiones históricas. Hallazgo nuevo de recuperación de PR corregido localmente. | Finalizar entrega Round19 y aceptación nativa del SHA final; merge normal cuando esté justificado. Después, inventario/preview exactos. Último inventario de master20/20UNKNOWN; decisión sobre evidencia independiente pendiente. Sin instalación. |
| #982 / [#996](https://github.com/vypdev/copilot/pull/996) | `bbf3bf1660a4f53e194bc2eb965287c70439741a`;0/6 observaciones reales, sin entornos disponibles según el usuario. | Linux desktop I039/I040, Windows desktop I041/I042, cuenta de servicio Windows X023/X026. #981/accesibilidad/VoiceOver/zoom excluidos. |

## Resultado científico conservado

La ejecución original sigue vinculada a fuente `093fd141fd513c92d3d0eb28ba8d40805a5e8b90`, prerregistro privado `07f21a4cadbd1dbaf03566c57a8033f85e9ff760`, imagen `sha256:c5d0f155dd148f617be6417ffa5967ee3b1cde3f08bfcb04f29096b8e951c2a9`,19 drivers y CLI0.171.0. Hubo174 iniciales+26 seguimientos=200 invocaciones SDK científicas y un control técnico genuino separado. Los conteos internos del proveedor, modelo reportado y uso siguen UNKNOWN. Ningún resultado se relabela como ejecutado sobre los espejos redactados o sobre5327.

80 esperados/84 observados/74 emparejados;10FP/6FN. Precisión88,095238% FAIL; recall92,5%,F1 90,243902%, ubicación93,243243%, severidad91,891892%, categoría100%, Brier0,11320833 PASS. Bytes/orden/prompts/esquema:0 discrepancias. Los175 scopes originales tienen ausencia confirmada. [Resultados originales en espejo redactado](https://github.com/vypdev/copilot/blob/188ed25bdb2fea743a0d471a544f42c8f581bf4d/quality/bugbot/evidence/issue-974/campaigns/093fd141/results.md). Ejecución en host Mac ARM/contenedores Linux; no fue un job de GitHub Actions.

## #997: corrección operativa y límites de la evidencia

[Paquete publicado de5327](https://github.com/vypdev/copilot/tree/5327d533045ab10dff1ca6969317c12e93b88cf8/quality/bugbot/evidence/issue-974/controls/review-de62). Los mismos dos controles de SIGKILL fallido pasan0/2→2/2; la parada no confirmada conserva su causa sin inventar DELETE/confirmación. La prueba nativa inerte de20 huérfanos conserva20 zombis con Node comoPID1 y0 con tini dentro de la imagen fijada. Los605 controles de composición pasan; los presupuestos AST del Engine y supervisor pasan sin rebajas. La fuente exacta del canario original de red queda asociada al intento original, sin modificar recibos ni repetirlo. Los localizadores públicos innecesarios se minimizan y la copia privada íntegra queda conservada; versiones antiguas publicadas siguen sujetas a la purga de GitHub.

La nueva admisión **técnica y sin modelos** usa fuente5327, prerregistro privado `4c23a52264dd36fe975464ef5773ac5c5ff3ceb8` e imagen `sha256:6d196f4007103963549144b15aff1e1e6735450e2c85d04fb201b04980ab7106`: CLI14/14 y controles SDK C32–C35 4/4 PASS,0fallos/omisiones/cancelaciones. Comprueba bootstrap real, descenso de UID y composición de scopes;12 IDs propios tienen ausencia404 fresca al terminar. Conserva el mismo filtro fijo13/SHAfb324, sin capacidades o privilegios nuevos. Se ejecutó en Mac ARM/contenedores Linux, no en Actions. No acredita un nuevo control de herramientas con modelo ni modifica el174 original. Los clones de fuente generados coinciden con la fuente y runtime congelados; los originales de cada intento quedan preservados.

La CI nativa de5327 falla: dos lecturas de benchmark exceden5s en estáticos; cobertura registra un error al enviar el prompt en C15, fallos del journal PAT y del hijo Octokit, seguidos de error al serializar JSON circular. Código productivo SDK, scripts, dependencias y workflows son idénticos a de62. No se ha demostrado una causa común ni se ha repetido el job. Se encontró un defecto comprobable en el ejecutable simulado de C15: salía sin consumir stdin. Una nueva aserción de captura produce2PASS/1FAIL sobre ese fixture; el fixture corregido drena stdin y la misma suite completa pasa30/30. Esto no prueba por sí solo la causa de todos los errores nativos; los demás siguen UNKNOWN. La corrección está local, sin aumentar límites. Commit/Verification siguen bloqueados por el SDD seleccionado antes de clasificar, no por call-budget; no se ejecuta una tercera adopción idéntica ni se debilita la puerta.

## #999: aceptación4806 y corrección Round19 en curso

[Round18 publicado](https://github.com/vypdev/copilot/tree/4806e074dc31712a8ce9c2c9695805a3e56b7423/quality/bugbot/evidence/issue-998/review-round18). La aceptación nativa pertenece a4806:968 suites/19894 aserciones+35 omisiones,114/114 controles mapeados, CI/Commit/Verification PASS y revisión28/28 completada. Cinco observaciones anteriores respondidas y resueltas. Parser/doctor exigen guía completa, gitlinks ajenos no bloquean el lector y el guard de paquete cubre DNS real con controles de bucle local; se conservan negativos y el primer matcher defectuoso.

La nueva observación válida afecta la recuperación cuando más de1000 PRs ajenas desplazan la propuesta. La corrección local usa el filtro documentado `head=owner:rama-exacta`, todos los estados y sin filtro de base; conserva100/página,10páginas, rechazo de respuesta interminada y todos los controles de identidad/duplicidad/base/repositorio/estado. Cuatro cuerpos idénticos fallan en4806 y pasan corregidos;87/87 pruebas de la suite y36 suites/1539 aserciones focalizadas pasan. El catálogo acumula119 IDs/115mapeados+4casos de paquete; los118 objetos previos y el companion seleccionado64 siguen exactos. Types/lint y los presupuestos existentes de6 módulos puros/20runtime pasan. El exit1 focalizado por pisos globales/web/publicación no ejecutados se conserva y no se presenta como aceptación global. Validaciones de entrega/paquete y hooks pendientes.0POSTs reales,0instalaciones,0modelos.

## Diagnóstico Linux #1003: ejecución existente recuperada

No se ha despachado otro ensayo. El run existente [45066614197](https://github.com/vypdev/copilot/actions/runs/45066614197), job137344089146/ubuntu-runner-4, ejecutó fuente `3fa4c4067b3ca142ef4abce0986d185bb0c8b3db`:8PASS/2FAIL,10estados/20canales comprobados y limpieza completa. `unshare(USER|NET)` falla con EPERM al escribir uid_map; Codex con PATH vacío falla RTM_NEWADDR/EPERM, mientras los transportes y controles de lectura/denegación con PATH pasan. Ese job no tenía `/var/run/docker.sock`; no demuestra ausencia de Docker en todos los hosts. Compatibilidad de streams Node no medida; no es admisión SDK/herramientas/modelos ni explica los fallos de otra CI. La descripción de #1003 sigue obsoleta respecto de Native5 y el174 y necesita reconciliación. Los negativos originales se conservan.

## Privacidad, continuidad y decisiones externas

Solicitud ya enviada y verificada como [GitHub Support #5044568](https://help.github.com/ticket/personal/0/5044568), sin duplicados. La última lectura observó Open y únicamente nuestra solicitud original; no se afirma eliminación completa ni una respuesta posterior no observada. Los hilos de purga alojada permanecen abiertos. La rama actual y seis cuerpos editables están saneados; los21fragmentos históricos y copias alojadas requieren actuación de GitHub. Ninguna autorización nueva de reescritura se infiere.

Las decisiones ya solicitadas sobre adopción revisada del snapshot SDD y evidencia independiente del inventario siguen pendientes; no se fabrican aprobaciones ni se reitera la pregunta de entornos. No se ha hecho merge ni instalación en esta continuación. Los bundles5327/4806 y prerregistro4c23 ya están retenidos y verificados; el archivo y limpieza de los nuevos logs/intermedios sigue pendiente. Checkout principal y17stashes conservados.

[Continuación150 completa e inmutable, con149 y todo el historial previo](https://github.com/vypdev/copilot/blob/5327d533045ab10dff1ca6969317c12e93b88cf8/quality/bugbot/evidence/issue-974/campaigns/093fd141/canonical150-historical.md):56524bytes, SHA256 `f7988998aa2c4b459805dedfa552d8a4dcada7a4708201b717f43f066dbcb35b`. [Continuación141 original](https://github.com/vypdev/copilot/blob/188ed25bdb2fea743a0d471a544f42c8f581bf4d/quality/bugbot/evidence/issue-974/campaigns/093fd141/canonical141.md):65495bytes/SHAa821cf4c…; el historial no se sustituye por una reconstrucción.

`BUGBOT_VERIFICATION_MODE=disabled`; ningún perfil cualificado,42sin iniciar, instalación NOT_EXECUTED,0intentos de escritura en pilotos. Sin releases, activación, cambios de protecciones o privilegios.

</details>

</details>


</details>


</details>


</details>


</details>

</details>

</details>

</details>

</details>

</details>

</details>

</details>
