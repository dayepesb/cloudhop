---
title: Open the AWS console
description: Open the web console as an alias, already signed in, without going through the access portal.
---

```bash
cloudhop console acme-prod             # the console home, signed in as acme-prod
cloudhop console acme-prod s3          # straight to S3
cloudhop console acme-prod lambda --region eu-west-1
cloudhop console                       # pick the alias from a list
```

Your browser opens the AWS console **already signed in** to that account and
role, in the alias' region. No access portal, no hunting for the account among
dozens, no clicking "Management console".

The **Console** button next to each alias in [`cloudhop ui`](/cloudhop/guides/web-ui/)
does the same.

## How it works

cloudhop uses the session it already has to get short-lived credentials for
the alias, and exchanges them with AWS's sign-in service (the documented
"custom identity broker" flow) for a one-time sign-in link. Then it opens that
link in your browser.

- If the session expired, cloudhop signs you in first, as usual.
- The sign-in link is a secret for 15 minutes: cloudhop opens it and **never
  prints or logs it**. Credentials are sent to AWS in the request body, never
  in a URL.
- The console session lasts as long as your role session (set by your
  administrators in IAM Identity Center).

If AWS doesn't accept a direct sign-in for that role, cloudhop opens the same
account and role **through your access portal** instead (its official
shortcut link), and tells you so.

## Service names

The second argument is the service part of the console's URL: `s3`, `ec2`,
`lambda`, `cloudwatch`, `iam`, `dynamodb`, `cloudformation`, `rds`... If a
service opens its home page under another name, use that name.

## Personal accounts

For accounts added with `aws login`, cloudhop tries the same direct sign-in.
If AWS doesn't allow it for that kind of session, the console's sign-in page
opens and you sign in as usual.

## Several accounts at once

AWS lets your browser keep several console sessions at once if you turn on
**multi-session** in the console's account menu. Otherwise, signing in to a
second alias replaces the first one in that browser.
