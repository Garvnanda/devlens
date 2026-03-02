export interface CommandContext {
    args: string[];
    raw: string;
    writeOutput: (text: string, color?: string) => void;
}

export interface Command {
    name: string;
    description: string;
    execute: (ctx: CommandContext) => Promise<void> | void;
}

export const CommandRegistry: Record<string, Command> = {};

export const registerCommand = (cmd: Command) => {
    CommandRegistry[cmd.name] = cmd;
};
