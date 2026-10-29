---
title: Run in many accounts
description: Run one command in many aliases at once, chosen by name, list, wildcard, regular expression, portal or production mark.
---

```bash
cloudhop each 'globex-*' -- s3 ls
cloudhop each creci-qa,creci-prod -- sts get-caller-identity --query Account --output text
cloudhop each '/^acme-(dev|qa)$/' -- ec2 describe-instances --output table
cloudhop each --source acme --no-prod -- lambda list-functions
```

Everything after `--` is the `aws` command, as with `hop`.

## Choosing the aliases

| You write | It selects |
| --- | --- |
| `acme-dev` | that alias |
| `acme-dev,acme-qa` or `acme-dev acme-qa` | those aliases |
| `'acme-*'`, `'*-prod'`, `'team-?'` | wildcards (`*` any text, `?` one character) |
| `'/^acme-(dev\|qa)$/'` | a regular expression between slashes (add `i` after the last slash to ignore case) |
| `--source acme` | every alias of that portal |
| `--prod` / `--no-prod` | only production, or everything except production |

You can mix them: `cloudhop each 'acme-*' --no-prod -- ...`. Quote wildcards
and regular expressions so your shell doesn't expand them.

## What happens

1. cloudhop lists the aliases it selected, with account and region, and asks
   before running. Use `--yes` in scripts.
2. If the command may change resources in a production alias, it asks once
   more for those (see [Protect production](/cloudhop/guides/production/)).
3. Expired portals are signed in first, one at a time.
4. The command runs in up to 4 aliases at a time (`--parallel 8` for more,
   up to 16). Each output line is labelled with its alias:

   ```text
   [creci-qa]        799633563243
   [creci-prod]      982294761008
   [backend-cloud]   026090553765
   3 ok
   ```

5. It exits with `1` if any alias failed, and tells you which.

## For scripts

`--json` prints one JSON document with every alias' exit code and output,
and nothing else on standard output:

```bash
cloudhop each 'acme-*' --yes --json -- s3api list-buckets --query 'Buckets[].Name' \
  | jq '.results[] | {alias, buckets: (.stdout | fromjson)}'
```
