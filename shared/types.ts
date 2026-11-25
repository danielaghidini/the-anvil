export interface Project {
  id: number;
  name: string;
  plugin: string;
  createdAt: string;
}
export interface CatalogQuest {
  id: string;
  name: string;
  group: string;
  plugin: string;
  stages: string[];
}
export interface PluginQuest {
  id: string;
  name?: string;
  /** The name stored in the plugin, set when the user renamed the quest in the app. */
  pluginName?: string;
  objectiveStages?: number[];
  stageObjectives?: Record<string, number[]>;
  objectiveTexts?: Record<string, string>;
  formId: string;
  stages: number[];
}
export interface PluginSnapshot {
  plugin: string;
  masters: string[];
  quests: PluginQuest[];
  /** Quest IDs in the order they start, detected from scripts and dialogue conditions. */
  questOrder?: string[];
  importedAt: string;
}
