import type { Config, Target } from '../domain/model';

export interface ConfigStore {
  load(): Promise<Config>;
  save(config: Config): Promise<void>;
  loadTargets(sourceId: string): Promise<Target[]>;
  saveTargets(sourceId: string, targets: Target[]): Promise<void>;
  removeTargets(sourceId: string): Promise<void>;
}
