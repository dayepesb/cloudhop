---
title: Ejecuta en muchas cuentas
description: Ejecuta un comando en muchos alias a la vez, elegidos por nombre, lista, comodín, expresión regular, portal o marca de producción.
---

```bash
cloudhop each 'globex-*' -- s3 ls
cloudhop each creci-qa,creci-prod -- sts get-caller-identity --query Account --output text
cloudhop each '/^acme-(dev|qa)$/' -- ec2 describe-instances --output table
cloudhop each --source acme --no-prod -- lambda list-functions
```

Todo lo que va después de `--` es el comando de `aws`, igual que con `hop`.

## Elige los alias

| Escribes | Selecciona |
| --- | --- |
| `acme-dev` | ese alias |
| `acme-dev,acme-qa` o `acme-dev acme-qa` | esos alias |
| `'acme-*'`, `'*-prod'`, `'team-?'` | comodines (`*` cualquier texto, `?` un carácter) |
| `'/^acme-(dev\|qa)$/'` | una expresión regular entre barras (agrega `i` después de la última barra para ignorar mayúsculas y minúsculas) |
| `--source acme` | todos los alias de ese portal |
| `--prod` / `--no-prod` | solo producción, o todo menos producción |

Puedes combinarlos: `cloudhop each 'acme-*' --no-prod -- ...`. Pon entre
comillas los comodines y las expresiones regulares para que tu shell no los
expanda.

## Qué pasa

1. cloudhop lista los alias que seleccionó, con su cuenta y región, y
   pregunta antes de ejecutar. Usa `--yes` en scripts.
2. Si el comando puede cambiar recursos en un alias de producción, pregunta
   una vez más por esos (consulta
   [Protege producción](/cloudhop/es/guides/production/)).
3. Primero inicia sesión en los portales vencidos, uno por uno.
4. El comando se ejecuta en hasta 4 alias a la vez (`--parallel 8` para más,
   hasta 16). Cada línea de la salida va marcada con su alias:

   ```text
   [creci-qa]        799633563243
   [creci-prod]      982294761008
   [backend-cloud]   026090553765
   3 ok
   ```

5. Termina con código `1` si algún alias falló, y te dice cuál.

## Para scripts

`--json` imprime un solo documento JSON con el código de salida y la salida de
cada alias, y nada más en la salida estándar:

```bash
cloudhop each 'acme-*' --yes --json -- s3api list-buckets --query 'Buckets[].Name' \
  | jq '.results[] | {alias, buckets: (.stdout | fromjson)}'
```
