import { spawn } from 'node:child_process';
import type { BrowserOpener } from '@cloudhop/core';

/** Opens URLs with the OS default browser. Failing to open is not fatal: the URL is also printed. */
export class NodeBrowserOpener implements BrowserOpener {
  async open(url: string): Promise<void> {
    const [command, args] =
      process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
          : ['xdg-open', [url]];
    await new Promise<void>((resolve) => {
      const child = spawn(command, args as string[], { stdio: 'ignore', detached: true });
      child.on('error', () => resolve());
      child.on('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}
