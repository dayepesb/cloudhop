import { type Fetch, getJson } from '../http';

/** IAM Identity Center portal API (https://docs.aws.amazon.com/singlesignon/latest/PortalAPIReference/). */

export interface AccountInfo {
  accountId: string;
  accountName?: string;
  emailAddress?: string;
}

export interface RoleInfo {
  accountId: string;
  roleName: string;
}

export interface RoleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  /** Epoch milliseconds. */
  expiration: number;
}

export class PortalClient {
  private readonly endpoint: string;

  constructor(
    region: string,
    private readonly accessToken: string,
    private readonly fetchFn: Fetch,
  ) {
    this.endpoint = `https://portal.sso.${region}.amazonaws.com`;
  }

  listAccounts(): Promise<AccountInfo[]> {
    return this.paginate<AccountInfo>('/assignment/accounts', {}, 'accountList');
  }

  listAccountRoles(accountId: string): Promise<RoleInfo[]> {
    return this.paginate<RoleInfo>('/assignment/roles', { account_id: accountId }, 'roleList');
  }

  async getRoleCredentials(accountId: string, roleName: string): Promise<RoleCredentials> {
    const query = new URLSearchParams({ account_id: accountId, role_name: roleName });
    const body = await getJson<{ roleCredentials: RoleCredentials }>(
      this.fetchFn,
      `${this.endpoint}/federation/credentials?${query}`,
      this.headers(),
    );
    return body.roleCredentials;
  }

  private async paginate<T>(
    path: string,
    params: Record<string, string>,
    key: string,
  ): Promise<T[]> {
    const items: T[] = [];
    let nextToken: string | undefined;
    do {
      const query = new URLSearchParams({ ...params, max_result: '100' });
      if (nextToken) query.set('next_token', nextToken);
      const page = await getJson<Record<string, unknown>>(
        this.fetchFn,
        `${this.endpoint}${path}?${query}`,
        this.headers(),
      );
      items.push(...((page[key] as T[] | undefined) ?? []));
      nextToken = page.nextToken as string | undefined;
    } while (nextToken);
    return items;
  }

  private headers(): Record<string, string> {
    return { 'x-amz-sso_bearer_token': this.accessToken };
  }
}
