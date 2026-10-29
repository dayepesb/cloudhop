---
title: Alias y regiones
description: Crea alias, cámbiales el nombre o la región, y elimínalos.
---

Un alias es tu nombre corto para una cuenta, un rol y una región. Es lo que
escribes después de `hop`.

## Crea alias

Justo después de agregar una fuente, cloudhop te deja elegir cuentas y
ponerles nombre. Para agregar más después:

```bash
cloudhop alias acme
```

Marca las cuentas y roles que quieras (escribe para filtrar). Para cada uno,
cloudhop te pide:

- **El alias.** Letras minúsculas, números, `-` y `_`. Elige algo que
  puedas escribir rápido: `acme-prod`, `billing-ro`, `sandbox`.
- **La región.** Por defecto es la región del portal. Si escribes otra, esa
  pasa a ser la predeterminada para el siguiente alias, así que no tienes que
  repetirla para un grupo en la misma región.

Algunos nombres están reservados porque son comandos: `add`, `alias`, `login`,
`region`, `setup`, `sync`, `ls`, `list`, `rm`, `remove`, `doctor`, `exec`,
`provider`, `ui`, `help` y `version`.

## Cambia la región de un alias

```bash
cloudhop region acme-prod eu-west-1     # de una vez
cloudhop region acme-prod               # pregunta, sugiriendo la actual
cloudhop region                         # elige el alias de una lista
```

En los portales de empresa, el perfil en `~/.aws/config` también cambia, así
que las otras herramientas lo siguen. cloudhop rechaza errores de escritura
como `us-wst-1`.

¿Necesitas otra región solo una vez? Pásala al comando:

```bash
hop acme-prod s3 ls --region ap-southeast-2
cloudhop exec acme-prod --region ap-southeast-2 -- terraform plan
```

## Cambia el nombre de un alias

Elimínalo y vuelve a crearlo con el nombre nuevo:

```bash
cloudhop rm old-name
cloudhop alias acme
```

## Elimina alias y fuentes

```bash
cloudhop rm acme-dev                 # un alias
cloudhop rm acme-dev acme-qa         # varios
cloudhop rm acme                     # una fuente completa y sus alias (pregunta antes)
cloudhop rm acme --yes               # sin preguntar, para scripts
```

Si un alias y una fuente tienen el mismo nombre, `cloudhop rm <name>` elimina
el alias; usa `cloudhop rm --source <name>` para la fuente.

## Míralo todo

```bash
cloudhop ls          # todas las fuentes con sus alias
cloudhop ls acme     # solo una fuente
```
