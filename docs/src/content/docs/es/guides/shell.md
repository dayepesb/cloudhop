---
title: Usa un alias en tu terminal
description: Cambia la terminal a un alias, fija alias a carpetas de proyecto con .cloudhoprc, sigue escribiendo `aws` y mira el alias en tu prompt.
---

La forma de trabajar del día a día: cambias la terminal a un alias y sigues
escribiendo los comandos `aws` que ya conoces. `cloudhop use` es tu interruptor entre cuentas de AWS:

```text
❯ cloudhop use license-qa
cloudhop › This shell now uses license-qa (license-account / Dev, us-east-1).

[ aws license-qa (us-east-1) ]                ← tu prompt lo muestra
❯ aws ecs list-clusters                       ← aws normal, como license-qa
❯ aws ecs list-tasks --cluster api --launch-type FARGATE
❯ terraform plan                              ← y cualquier otra herramienta
```

`license-qa` y los demás nombres de esta página son alias de ejemplo; usa
los tuyos. `hop`, `each` y `console` siguen funcionando igual: un alias que escribes en
un comando gana solo para ese comando y no cambia la terminal.

## ¿Tengo que configurar algo?

**Para `hop`, `each`, `console`, `exec` y la página web: no.** Funcionan
apenas haces `npm install`.

**Para cambiar la terminal en la que escribes: una línea en el archivo de
inicio de tu shell.** Un programa no puede cambiar el entorno de la terminal
que lo abrió; solo la shell puede. Por eso se necesita una línea. Ejecuta esto una vez (`cloudhop setup` también lo
ofrece):

```bash
cloudhop shell
```

Te pregunta, agrega una línea a `~/.zshrc`, `~/.bashrc`, el `config.fish` de
fish o tu perfil de PowerShell, y abres una terminal nueva. Para agregarla a
mano:

| Shell | Línea |
| --- | --- |
| zsh (después de `compinit`) | `eval "$(cloudhop shell zsh)"` |
| bash | `eval "$(cloudhop shell bash)"` |
| fish | `cloudhop shell fish \| source` |
| PowerShell | `cloudhop shell pwsh \| Out-String \| Invoke-Expression` |

**Sin ella**, `cloudhop use <alias>` igual funciona: abre una shell nueva que
usa el alias. Escribe `exit` para volver.

## Cambia la terminal: `cloudhop use`

```bash
cloudhop use license-qa     # o solo `cloudhop use` para elegir de una lista
cloudhop use --off          # deja de usar cualquier alias
cloudhop use --off aws      # deja de usar solo el de AWS
```

Lo que hace cloudhop:

1. Inicia tu sesión si venció (el navegador se abre solo en ese caso).
2. Pone el perfil y la región del alias **solo en esta terminal**
   (`AWS_PROFILE`, `AWS_REGION`, `AWS_DEFAULT_REGION`) y borra las access
   keys que hubiera. Las demás terminales no cambian.
3. Recuerda qué alias usa cada nube (`CLOUDHOP_AWS_ALIAS`), para que tu
   prompt lo muestre y, cuando lleguen Azure y Google Cloud, puedas tener un
   alias de cada una activo al mismo tiempo.

## Sigue escribiendo `aws`

Con la integración, `aws` en tu terminal pasa por cloudhop mientras usas un
alias. Escribir `aws s3 ls` es lo mismo que `hop license-qa s3 ls`:

- **¿Sesión vencida?** Se abre tu navegador, apruebas y el comando continúa.
  Sin `aws sso login` ni credenciales copiadas.
- **¿Alias de producción?** Las lecturas corren de una; todo lo que pueda
  cambiar recursos pregunta primero. Consulta
  [Protege producción](/cloudhop/es/guides/production/).
- `aws ... --profile otro` y `command aws ...` ejecutan el AWS CLI directo,
  como siempre. Sin un alias en uso, `aws` es solo `aws`.

Cómo funciona: la integración define una función de shell llamada `aws`. Las
funciones de shell tienen prioridad sobre los programas del `PATH`, y dentro
de ella `command aws` llama al real. El AWS CLI no se modifica. Lo apagas con
`CLOUDHOP_WRAP=0`.

:::caution
Los scripts, los Makefiles y herramientas como Terraform llaman al AWS CLI o
al SDK directo, no a tu función de shell. Sí corren como el alias (leen
`AWS_PROFILE`), pero sin el inicio de sesión automático ni las verificaciones
de producción. Para esos casos usa `cloudhop exec <alias> -- <comando>`.
:::

## Fija un alias a una carpeta: `.cloudhoprc`

Pones un `.cloudhoprc` en un proyecto y la terminal cambia a
su alias cuando haces `cd` al proyecto (o a cualquier carpeta dentro de él),
y lo quita cuando sales.

**Configura un proyecto una vez:**

```bash
cd ~/repos/license-api
cloudhop use license-qa --save    # escribe .cloudhoprc y lo marca como confiable
git add .cloudhoprc               # opcional: compártelo con tu equipo
```

El archivo es texto plano, una línea por nube:

```text
# cloudhop: aliases for this folder
aws: license-qa
```

**Desde ahí, solo haz `cd` y escribe `aws`:**

```text
❯ cd ~/repos/license-api
cloudhop › Using license-qa (license-account / Dev, us-east-1), from .cloudhoprc.
[ aws license-qa (us-east-1) ]
❯ aws ecs list-tasks --cluster api
❯ cd ~/repos/billing                     ← otro proyecto, otra cuenta
cloudhop › Using billing-dev (billing-account / Dev, us-east-1), from .cloudhoprc.
❯ cd ~
cloudhop › Left the folder of billing-dev: no alias in this shell.
```

**Un compañero que clona el repositorio** ejecuta `cloudhop allow` una vez
en él. Su alias debe llamarse igual: comparte los nombres con
[`cloudhop team export`](/cloudhop/es/guides/team/).

**Apruebas cada archivo primero.** Un `.cloudhoprc` que no escribiste (por
ejemplo, en un repositorio que acabas de clonar) no hace nada hasta que
ejecutas `cloudhop allow` en esa carpeta, y cualquier cambio posterior al
archivo pide un nuevo `cloudhop allow`. `cloudhop deny` lo retira. Un
`.cloudhoprc` solo puede nombrar alias que ya tienes: nunca agrega portales,
no inicia sesión ni toca credenciales, y entrar a una carpeta nunca abre tu
navegador.

Un `cloudhop use` que escribes tú gana hasta que sales de la carpeta. Apaga
el cambio automático con `CLOUDHOP_AUTO_USE=0`.

## Mira el alias en tu prompt

**Aparece solo** después de ejecutar `cloudhop shell`, en una terminal nueva:

- **Starship**: `cloudhop shell` agrega a tu `~/.config/starship.toml` un
  segmento `aws license-qa (us-east-1)` que se ve como el resto de tu
  prompt: en un tema powerline entra en la cadena con tus mismas flechas y
  colores; si no, es texto de color como los módulos propios de Starship.
  Los alias de producción salen en rojo con `PROD`. Queda una copia en
  `starship.toml.cloudhop-backup`. ¿Ya tenías la línea de la shell? Ejecuta `cloudhop shell` otra
  vez: agrega lo que falte.
- **zsh**: a la derecha del prompt (`aws:license-qa`).
- **bash** (también Git Bash en Windows) **y PowerShell** (Windows Terminal o
  la consola de Windows): antes del prompt, `[aws:license-qa] PS C:\repo>`.
- **fish**: a la derecha, salvo que tengas tu propio `fish_right_prompt`.
- **cmd.exe** no tiene integración: `cloudhop use` abre un `cmd` nuevo cuyo
  prompt empieza con `[aws:license-qa]`.

La etiqueta es azul, y roja con `PROD` en los alias de producción.

**¿Dónde estoy?** En cualquier terminal, `cloudhop status` empieza diciendo
qué alias usa esta terminal:

```text
❯ cloudhop status
This terminal uses aws license-qa (us-east-1).
```

¿No lo quieres? `CLOUDHOP_PROMPT=0` apaga la etiqueta integrada; en
Starship, borra el bloque `# >>> cloudhop >>>` y los segmentos
`${env_var.cloudhop_*}` del `format`. `cloudhop shell starship` imprime el
fragmento de Starship si prefieres ubicarlo tú.

¿Armas el tuyo? Estas variables existen mientras usas un alias:

| Variable | Ejemplo |
| --- | --- |
| `CLOUDHOP_AWS_ALIAS` | `license-qa` |
| `CLOUDHOP_AWS_PROMPT` | `license-qa (us-east-1)` |
| `CLOUDHOP_AWS_PROD` | `1` en alias de producción; si no, no existe |
| `CLOUDHOP_AWS_SEGMENT` / `CLOUDHOP_AWS_PROD_SEGMENT` | Como `CLOUDHOP_AWS_PROMPT`, pero solo existe uno: el segundo en producción, para que un tema le dé otro color |

## Elige de una lista y autocompleta

No tienes que recordar los nombres de los alias:

```bash
hop               # elige el alias y luego escribe el comando (vacío = quién soy)
hop - s3 ls       # elige el alias y luego ejecuta `aws s3 ls`
cloudhop use      # elige el alias para esta terminal
cloudhop console  # elige el alias y abre su consola
```

Escribe palabras en cualquier orden para filtrar: `license q` encuentra
`license-qa`. Con la integración, <kbd>Tab</kbd> también completa nombres de
alias después de `hop`, los comandos de `cloudhop`, y alias o portales
después de los comandos que los reciben.

## Opciones de un vistazo

| Variable | Efecto |
| --- | --- |
| `CLOUDHOP_WRAP=0` | `aws` sigue siendo el AWS CLI normal aunque uses un alias |
| `CLOUDHOP_AUTO_USE=0` | `cd` no lee archivos `.cloudhoprc` |
| `CLOUDHOP_PROMPT=0` | Sin la etiqueta del alias en el prompt (Starship se configura aparte) |
