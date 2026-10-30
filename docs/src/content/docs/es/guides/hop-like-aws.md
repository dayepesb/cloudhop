---
title: Usa hop como el comando aws
description: hop es el AWS CLI con la cuenta, el rol y la región ya elegidos. Todo lo que sabes de aws sigue funcionando.
---

`hop` no reemplaza al AWS CLI: lo ejecuta por ti. `hop acme-prod <args>`
ejecuta `aws <args>` con el perfil y la región del alias, después de
asegurarse de que tienes la sesión iniciada. Todo lo que haces con `aws` lo
puedes hacer con `hop`.

:::tip[¿Prefieres seguir escribiendo `aws`?]
Cambia la terminal: `cloudhop use acme-prod` y luego `aws ...` normal.
Consulta [Usa un alias en tu terminal](/cloudhop/es/guides/shell/). `hop` es
práctico para comandos puntuales en otra cuenta sin cambiar la terminal.
:::

## La regla

Toma cualquier comando de `aws`, cambia `aws` por `hop <alias>` y quita
`--profile` (el alias ya dice qué cuenta y rol usar):

```bash
aws  s3 cp report.csv s3://acme-reports/ --profile acme-prod
hop acme-prod s3 cp report.csv s3://acme-reports/
```

Sin argumentos, `hop <alias>` ejecuta `aws sts get-caller-identity`, un rápido
"¿quién soy?":

```bash
hop acme-prod
```

```json
{
    "UserId": "AROAEXAMPLEID:you@acme.com",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_AdministratorAccess_abc123/you@acme.com"
}
```

## Todo pasa directo

| Usas | Funciona porque |
| --- | --- |
| Cualquier servicio y subcomando (`s3`, `ec2`, `eks`, `logs tail --follow`, ...) | Los argumentos le llegan a `aws` sin cambios |
| `--region eu-west-1` | Reemplaza la región del alias solo para ese comando |
| `--output json`, `--query`, `--no-cli-pager` | Son opciones de `aws` y pasan tal cual |
| Tuberías y redirecciones: `hop acme-prod s3 ls \| grep logs` | La salida estándar es la de `aws`; cloudhop escribe sus mensajes en la salida de error |
| Comandos interactivos y preguntas | La entrada estándar va directo a `aws` |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | Detiene `aws`, como siempre |
| Códigos de salida en scripts (`if hop acme-prod s3 ls ...`) | `hop` devuelve el código de salida de `aws` |

## Lo que cloudhop agrega alrededor del comando

1. **Busca el alias**: cuenta, rol y región.
2. **Revisa la sesión.** Si venció, cloudhop la renueva en silencio, o abre
   el navegador y espera a que inicies sesión.
3. **Ejecuta `aws`** con `AWS_PROFILE` y `AWS_REGION` del alias. Las access
   keys heredadas de tu shell (`AWS_ACCESS_KEY_ID` y similares) se ignoran para
   que no reemplacen al alias sin que te des cuenta.
4. **Reintenta una vez** si `aws` todavía reporta una sesión vencida, después
   de volver a iniciar sesión.

Así un comando nunca arranca con una sesión que cloudhop ya sabe que venció.

## En scripts

`hop` funciona en scripts de shell y Makefiles igual que `aws`:

```bash
#!/usr/bin/env bash
set -euo pipefail

for alias in acme-prod acme-dev; do
  echo "== $alias"
  hop "$alias" s3 ls --output text | wc -l
done
```

Si una sesión venció, el script se detiene en el primer `hop` y abre el
navegador; cuando inicias sesión, continúa.

## Otras herramientas, no `aws`

Para Terraform, los SDK o cualquier otro programa, usa el perfil del alias
(`AWS_PROFILE=acme-prod`) o `cloudhop exec`. Consulta
[Uso con otras herramientas](/cloudhop/es/guides/other-tools/).

```bash
cloudhop exec acme-prod -- terraform plan
```

## Consejos

- **Autocompletado:** `hop acme-prod s3 <Tab>` no completa subcomandos de AWS.
  Si dependes del autocompletado, `aws --profile acme-prod ...` también
  funciona, porque el alias es un perfil real (en portales de empresa).
- **Otra región una sola vez:** basta con `--region` al final; para cambiarla
  de forma permanente, usa `cloudhop region acme-prod <región>`.
- **Varias cuentas a la vez:** cada llamada a `hop` es independiente, así que
  dos terminales pueden usar dos alias al mismo tiempo.
