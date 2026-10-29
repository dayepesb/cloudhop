---
title: Scripts y automatización
description: Usa cloudhop sin preguntas interactivas, desde scripts, dotfiles o herramientas de configuración.
---

Todos los comandos de configuración también funcionan con flags, así que
puedes automatizar la preparación de una máquina nueva o compartir una
configuración con tu equipo. Sin una terminal (en un script, un pipe o CI),
cloudhop nunca se queda esperando una respuesta: te dice qué flag falta.

## Configura una máquina

```bash
cloudhop provider enable aws

# Un portal de empresa: inicia sesión en el navegador y luego lista las cuentas
cloudhop add aws sso --start-url https://acme.awsapps.com/start --region us-east-1 --name acme

# Mira las cuentas y roles, con sus ids
cloudhop alias acme --list

# Crea alias
cloudhop alias acme --target 123456789012/AdministratorAccess --name acme-prod
cloudhop alias acme --target 210987654321/ReadOnly --name acme-dev --region us-east-2
```

El id de `--target` es `<account id>/<role name>`, tal como lo muestra
`--list`.

Para una cuenta personal:

```bash
cloudhop add aws console-login --region us-east-1 --name personal
```

## Otros comandos no interactivos

```bash
cloudhop region acme-prod eu-west-1
cloudhop rm acme-dev
cloudhop rm acme --yes          # sin terminal, eliminar una fuente requiere --yes
cloudhop ls
```

## En CI

cloudhop está hecho para personas: iniciar sesión requiere un navegador y un
humano. En CI, usa los mecanismos propios de la nube, como OIDC de GitHub
Actions con
[`aws-actions/configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials).

## Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | Éxito |
| `1` | Error de cloudhop (el mensaje dice qué pasó y cómo arreglarlo) |
| `130` | Cancelado con <kbd>Ctrl</kbd>+<kbd>C</kbd> |
| otro | `hop` y `cloudhop exec` devuelven el código de salida del comando que ejecutaron |
