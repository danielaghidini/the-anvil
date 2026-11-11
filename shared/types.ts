export interface Project { id: number; name: string; plugin: string; createdAt: string }
export interface CatalogQuest { id: string; name: string; group: string; plugin: string; stages: string[] }
export interface PluginQuest { id: string; name?: string; objectiveStages?: number[]; stageObjectives?: Record<string,number[]>; objectiveTexts?: Record<string,string>; formId: string; stages: number[] }
export interface PluginSnapshot { plugin: string; masters: string[]; quests: PluginQuest[]; importedAt: string }
