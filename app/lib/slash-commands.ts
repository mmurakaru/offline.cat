import i18n from "./i18n";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
}

export function getSlashCommands(options?: {
  canTranslate?: boolean;
}): SlashCommand[] {
  const commands: SlashCommand[] = [
    {
      id: "source",
      label: i18n.t("slash.sourceLabel"),
      description: i18n.t("slash.sourceDescription"),
    },
  ];

  if (options?.canTranslate !== false) {
    commands.push({
      id: "ai",
      label: i18n.t("slash.aiLabel"),
      description: i18n.t("slash.aiDescription"),
    });
  }

  commands.push({
    id: "voice",
    label: i18n.t("slash.voiceLabel"),
    description: i18n.t("slash.voiceDescription"),
  });

  return commands;
}

export interface CommandCallbacks {
  onInsertSource: () => void;
  onTranslateSegment: () => void;
  onStartDictation: () => void;
  canTranslate?: () => boolean;
}

export function executeCommand(
  commandId: string,
  callbacks: CommandCallbacks,
): void {
  switch (commandId) {
    case "source":
      callbacks.onInsertSource();
      break;
    case "ai":
      callbacks.onTranslateSegment();
      break;
    case "voice":
      callbacks.onStartDictation();
      break;
  }
}

export function filterCommands(
  commands: SlashCommand[],
  query: string,
): SlashCommand[] {
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter(
    (command) =>
      command.label.toLowerCase().includes(lower) ||
      command.id.toLowerCase().includes(lower),
  );
}
